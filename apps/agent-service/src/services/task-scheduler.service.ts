import {
  SCHEDULER_CLAIMS_PERMITTED,
  SCHEDULER_STAGE,
  publicSchedulerConfig,
  type SchedulerConfig,
} from "./task-scheduler.config.js";
import {
  planSchedulerCycle,
  referencedApprovalIds,
  referencedDependencyIds,
  type CyclePlan,
  type SchedulerApproval,
  type SchedulerTask,
} from "./task-scheduler.eligibility.js";
import type { TaskClaimResult } from "./task-claim.js";
import type { ExecutionPolicy } from "./task-execution-policy.js";

export type SchedulerStore = {
  listPending(): Promise<SchedulerTask[]>;
  countInProgress(): Promise<number>;
  loadTasks(ids: string[]): Promise<SchedulerTask[]>;
  loadApprovals(ids: string[]): Promise<SchedulerApproval[]>;
  loadExecutionPolicies(taskIds: string[]): Promise<{
    available: boolean;
    policies: ExecutionPolicy[];
  }>;
  claimTaskById(taskId: string, agentType: string, leaseSeconds: number): Promise<TaskClaimResult>;
};

export type SchedulerLogger = {
  info(fields: Record<string, unknown>): void;
  warn(fields: Record<string, unknown>): void;
};

export type SchedulerLifecycle = "disabled" | "running" | "stopped";

export type CycleReport = {
  stage: typeof SCHEDULER_STAGE;
  mode: "disabled" | "dry-run" | "claims-withheld" | "stopped";
  autonomous_execution: false;
  claims_permitted: false;
  running: number;
  evaluated: number;
  eligible: CyclePlan["eligible"];
  claimable: CyclePlan["claimable"];
  skipped: CyclePlan["skipped"];
  deferred: CyclePlan["deferred"];
  claim_groups: CyclePlan["claim_groups"];
  claimed: Array<{ id: string; claim_token: string | null }>;
  claims_attempted: number;
  execution_policy_store: "ready" | "unavailable";
  claim_target_id: string | null;
};

type Timer = { cancel(): void };

export type TaskSchedulerOptions = {
  config: SchedulerConfig;
  store: SchedulerStore;
  logger?: SchedulerLogger;
  permitClaims?: boolean;
  schedule?: (fn: () => void, intervalMs: number) => Timer;
};

const silentLogger: SchedulerLogger = {
  info() {},
  warn() {},
};

export class TaskScheduler {
  private timer: Timer | null = null;
  private inflight: Promise<unknown> | null = null;
  private stopped = false;
  private lastCycle: CycleReport | null = null;
  private readonly config: SchedulerConfig;
  private readonly store: SchedulerStore;
  private readonly logger: SchedulerLogger;
  private readonly permitClaims: boolean;
  private readonly schedule: (fn: () => void, intervalMs: number) => Timer;

  constructor(options: TaskSchedulerOptions) {
    this.config = options.config;
    this.store = options.store;
    this.logger = options.logger ?? silentLogger;
    this.permitClaims = options.permitClaims === true;
    this.schedule = options.schedule ?? defaultSchedule;
  }

  status() {
    return {
      stage: SCHEDULER_STAGE,
      autonomous_execution: false as const,
      claims_permitted: SCHEDULER_CLAIMS_PERMITTED,
      config: publicSchedulerConfig(this.config),
      lifecycle: this.lifecycle(),
      dependency_columns: false,
      task_approval_columns: false,
      last_cycle: this.lastCycle,
    };
  }

  lifecycle(): SchedulerLifecycle {
    if (this.stopped) return "stopped";
    if (!this.config.enabled || !this.timer) return "disabled";
    return "running";
  }

  start(): void {
    if (this.stopped || this.timer) return;
    if (!this.config.enabled) {
      this.logger.info({
        event: "scheduler_disabled",
        stage: SCHEDULER_STAGE,
        autonomous_execution: false,
        claims_permitted: false,
      });
      return;
    }

    this.timer = this.schedule(() => {
      void this.onTick();
    }, this.config.pollIntervalMs);
    this.logger.info({
      event: "scheduler_started",
      stage: SCHEDULER_STAGE,
      dry_run: this.config.dryRun,
      poll_interval_ms: this.config.pollIntervalMs,
      autonomous_execution: false,
      claims_permitted: false,
    });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.timer?.cancel();
    this.timer = null;
    await this.inflight;
    this.logger.info({
      event: "scheduler_stopped",
      stage: SCHEDULER_STAGE,
    });
  }

  async runDryRun(): Promise<CycleReport> {
    return this.runCycle("dry-run");
  }

  /**
   * Stage 7.2.1 can address claim_agent_task_by_id, and this constant still refuses the call.
   */
  async runClaimCycle(): Promise<CycleReport> {
    return this.runCycle("claims-withheld");
  }

  private async onTick(): Promise<void> {
    if (this.stopped || this.inflight) return;
    const mode = this.config.dryRun ? "dry-run" : "claims-withheld";
    await this.runCycle(mode);
  }

  private async runCycle(mode: CycleReport["mode"]): Promise<CycleReport> {
    if (this.stopped) {
      const report = emptyReport("stopped", 0);
      this.lastCycle = report;
      this.logger.info({ event: "scheduler_skip_cycle", mode: "stopped" });
      return report;
    }

    if (mode === "disabled") {
      const report = emptyReport("disabled", 0);
      this.lastCycle = report;
      return report;
    }

    const work = this.evaluate(mode);
    this.inflight = work;
    try {
      return await work;
    } finally {
      if (this.inflight === work) this.inflight = null;
    }
  }

  private async evaluate(mode: CycleReport["mode"]): Promise<CycleReport> {
    const [pending, running] = await Promise.all([
      this.store.listPending(),
      this.store.countInProgress(),
    ]);
    const dependencyIds = referencedDependencyIds(pending);
    const approvalIds = referencedApprovalIds(pending);
    const [dependencies, approvals] = await Promise.all([
      dependencyIds.length > 0 ? this.store.loadTasks(dependencyIds) : Promise.resolve([]),
      approvalIds.length > 0 ? this.store.loadApprovals(approvalIds) : Promise.resolve([]),
    ]);
    const policyState = await this.store.loadExecutionPolicies(pending.map((task) => task.id));
    const tasksById = new Map<string, SchedulerTask>();
    for (const task of [...pending, ...dependencies]) tasksById.set(task.id, task);
    const approvalsById = new Map(approvals.map((approval) => [approval.id, approval]));
    const policiesByTaskId = new Map(policyState.policies.map((policy) => [policy.taskId, policy]));
    const plan = planSchedulerCycle(
      pending,
      running,
      this.config,
      tasksById,
      approvalsById,
      policiesByTaskId,
    );
    const claimTarget = exactClaimTarget(plan);
    const claimAttempt = await claimPlannedTask(this.store, plan, {
      claimsPermitted: mode === "claims-withheld"
        && !this.config.dryRun
        && this.permitClaims
        && SCHEDULER_CLAIMS_PERMITTED,
      leaseSeconds: this.config.leaseSeconds,
    });

    for (const skipped of plan.skipped) {
      this.logger.info({
        event: "scheduler_skip",
        mode,
        task_id: skipped.id,
        agent_type: skipped.agent_type,
        reasons: skipped.reasons,
      });
    }
    for (const deferred of plan.deferred) {
      this.logger.info({
        event: "scheduler_defer",
        mode,
        task_id: deferred.id,
        agent_type: deferred.agent_type,
        reasons: deferred.reasons,
      });
    }

    const report: CycleReport = {
      stage: SCHEDULER_STAGE,
      mode,
      autonomous_execution: false,
      claims_permitted: false,
      running,
      evaluated: pending.length,
      eligible: plan.eligible,
      claimable: plan.claimable,
      skipped: plan.skipped,
      deferred: plan.deferred,
      claim_groups: plan.claim_groups,
      claimed: claimAttempt.result?.outcome === "claimed" && claimAttempt.result.task_id
        ? [{ id: claimAttempt.result.task_id, claim_token: claimAttempt.result.claim_token }]
        : [],
      claims_attempted: claimAttempt.attempted ? 1 : 0,
      execution_policy_store: policyState.available ? "ready" : "unavailable",
      claim_target_id: claimTarget?.id ?? null,
    };
    this.lastCycle = report;
    this.logger.info({
      event: "scheduler_decision",
      mode,
      running,
      evaluated: pending.length,
      eligible: plan.eligible.map((task) => task.id),
      claimable: plan.claimable.map((task) => task.id),
      skipped: plan.skipped.map((task) => ({ id: task.id, reasons: task.reasons })),
      claims_attempted: claimAttempt.attempted ? 1 : 0,
      claim_target_id: claimTarget?.id ?? null,
      execution_policy_store: policyState.available ? "ready" : "unavailable",
      autonomous_execution: false,
    });
    if (mode === "claims-withheld") {
      this.logger.warn({
        event: "scheduler_claims_withheld",
        stage: SCHEDULER_STAGE,
        claims_permitted: SCHEDULER_CLAIMS_PERMITTED,
        claim_requested: this.permitClaims,
      });
    }
    return report;
  }
}

function emptyReport(mode: CycleReport["mode"], running: number): CycleReport {
  return {
    stage: SCHEDULER_STAGE,
    mode,
    autonomous_execution: false,
    claims_permitted: false,
    running,
    evaluated: 0,
    eligible: [],
    claimable: [],
    skipped: [],
    deferred: [],
    claim_groups: [],
    claimed: [],
    claims_attempted: 0,
    execution_policy_store: "ready",
    claim_target_id: null,
  };
}

export function exactClaimTarget(plan: CyclePlan): { id: string; agent_type: string } | null {
  const groups = plan.claim_groups.filter((group) =>
    group.claimable && group.would_claim === 1 && group.task_ids.length === 1);
  if (groups.length !== 1) return null;
  const group = groups[0];
  const taskId = group?.task_ids[0];
  const task = plan.claimable.find((item) => item.id === taskId && item.agent_type === group?.agent_type);
  if (!group || !task || task.id !== taskId) return null;
  return { id: task.id, agent_type: task.agent_type };
}

export async function claimPlannedTask(
  store: Pick<SchedulerStore, "claimTaskById">,
  plan: CyclePlan,
  options: { claimsPermitted: boolean; leaseSeconds: number },
): Promise<{ attempted: boolean; result: TaskClaimResult | null; taskId: string | null }> {
  const target = exactClaimTarget(plan);
  if (!options.claimsPermitted || !target) {
    return { attempted: false, result: null, taskId: target?.id ?? null };
  }
  const result = await store.claimTaskById(target.id, target.agent_type, options.leaseSeconds);
  if (result.outcome !== "claimed" || result.task_id !== target.id) {
    return {
      attempted: true,
      result: { ...result, outcome: result.task_id === target.id ? result.outcome : "claim_target_mismatch" },
      taskId: target.id,
    };
  }
  return { attempted: true, result, taskId: target.id };
}

function defaultSchedule(fn: () => void, intervalMs: number): Timer {
  const timer = setInterval(fn, intervalMs);
  timer.unref();
  return { cancel: () => clearInterval(timer) };
}
