import type { AgentTypeName } from "./agent-operations.service.js";
import { leaseExpired } from "./task-claim.js";
import {
  approvalDecision,
  approvalRequestId,
  consequentialAction,
  dependencyIds,
  dependencyRefusal,
} from "./task-claim-guards.js";

export { consequentialAction };
import type { SchedulerConfig } from "./task-scheduler.config.js";
import {
  evaluateExecutionPolicy,
  type ExecutionPolicy,
} from "./task-execution-policy.js";

export type SchedulerTask = {
  id: string;
  title: string;
  description: string;
  agent_type: string;
  status: string;
  priority: number;
  input: Record<string, unknown>;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  claim_token?: string | null;
  lease_expires_at?: string | null;
};

export type SchedulerApproval = {
  id: string;
  status: string;
  requested_action: string;
};

export type TaskSnapshot = {
  id: string;
  title: string;
  agent_type: string;
  priority: number;
  created_at: string;
};

export type SkipDecision = TaskSnapshot & {
  reasons: string[];
};

export type ClaimGroup = {
  agent_type: string;
  task_ids: string[];
  would_claim: number;
  claimable: boolean;
  reasons: string[];
};

export type CyclePlan = {
  eligible: TaskSnapshot[];
  claimable: TaskSnapshot[];
  skipped: SkipDecision[];
  deferred: SkipDecision[];
  claim_groups: ClaimGroup[];
};

export function compareSchedulerTasks(left: SchedulerTask, right: SchedulerTask): number {
  if (left.priority !== right.priority) return left.priority - right.priority;
  if (left.created_at !== right.created_at) return left.created_at < right.created_at ? -1 : 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export function snapshotTask(task: SchedulerTask): TaskSnapshot {
  return {
    id: task.id,
    title: task.title,
    agent_type: task.agent_type,
    priority: task.priority,
    created_at: task.created_at,
  };
}

export function evaluateTaskEligibility(
  task: SchedulerTask,
  context: {
    supportedAgentTypes: readonly AgentTypeName[];
    tasksById: ReadonlyMap<string, SchedulerTask>;
    approvalsById: ReadonlyMap<string, SchedulerApproval>;
    policiesByTaskId?: ReadonlyMap<string, ExecutionPolicy>;
    now?: number;
  },
): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const now = context.now ?? Date.now();

  if (task.status === "failed") {
    return { eligible: false, reasons: ["failed_not_retried"] };
  }
  if (leaseExpired(task, now)) {
    return { eligible: false, reasons: ["lease_expired"] };
  }
  if (task.status === "in_progress" || task.started_at) {
    return { eligible: false, reasons: ["already_claimed"] };
  }
  if (task.status !== "pending") {
    return { eligible: false, reasons: ["not_pending"] };
  }

  if (!context.supportedAgentTypes.includes(task.agent_type as AgentTypeName)) {
    reasons.push("unsupported_agent_type");
  }

  const dependency = dependencyRefusal(task, context.tasksById);
  if (dependency) reasons.push(dependency);

  const approval = approvalDecision(task, context.approvalsById);
  if (approval) reasons.push(approval);

  const action = consequentialAction(task);
  if (action) reasons.push(`externally_consequential:${action}`);

  const policy = context.policiesByTaskId?.get(task.id) ?? null;
  reasons.push(...evaluateExecutionPolicy(policy));

  return { eligible: reasons.length === 0, reasons };
}

export function referencedDependencyIds(tasks: readonly SchedulerTask[]): string[] {
  const ids = new Set<string>();
  for (const task of tasks) {
    for (const id of dependencyIds(task)) ids.add(id);
  }
  return [...ids];
}

export function referencedApprovalIds(tasks: readonly SchedulerTask[]): string[] {
  const ids = new Set<string>();
  for (const task of tasks) {
    const id = approvalRequestId(task.input);
    if (id) ids.add(id);
  }
  return [...ids];
}

export function planSchedulerCycle(
  tasks: readonly SchedulerTask[],
  runningCount: number,
  config: Pick<SchedulerConfig, "supportedAgentTypes" | "maxConcurrentTasks" | "maxClaimsPerCycle">,
  tasksById: ReadonlyMap<string, SchedulerTask>,
  approvalsById: ReadonlyMap<string, SchedulerApproval>,
  policiesByTaskId: ReadonlyMap<string, ExecutionPolicy> = new Map(),
  now = Date.now(),
): CyclePlan {
  const pending = tasks.filter((task) => task.status === "pending" && !task.started_at);
  const decisions = new Map<string, { eligible: boolean; reasons: string[] }>();
  for (const task of tasks) {
    decisions.set(task.id, evaluateTaskEligibility(task, {
      supportedAgentTypes: config.supportedAgentTypes,
      tasksById,
      approvalsById,
      policiesByTaskId,
      now,
    }));
  }

  const eligible = tasks
    .filter((task) => decisions.get(task.id)?.eligible)
    .sort(compareSchedulerTasks)
    .map(snapshotTask);
  const skipped: SkipDecision[] = tasks
    .filter((task) => !decisions.get(task.id)?.eligible)
    .sort(compareSchedulerTasks)
    .map((task) => ({
      ...snapshotTask(task),
      reasons: decisions.get(task.id)?.reasons ?? ["not_pending"],
    }));

  const slots = Math.max(0, config.maxConcurrentTasks - Math.max(0, runningCount));
  let remaining = Math.min(slots, config.maxClaimsPerCycle);
  const claimableIds = new Set<string>();
  const deferred = new Map<string, string[]>();
  const claimGroups: ClaimGroup[] = [];

  const pendingByType = new Map<string, SchedulerTask[]>();
  for (const task of pending) {
    const group = pendingByType.get(task.agent_type) ?? [];
    group.push(task);
    pendingByType.set(task.agent_type, group);
  }

  const supportedPending = config.supportedAgentTypes
    .map((agentType) => {
      const rows = (pendingByType.get(agentType) ?? []).slice().sort(compareSchedulerTasks);
      return { agentType, rows, first: rows[0] ?? null };
    })
    .filter((group): group is { agentType: AgentTypeName; rows: SchedulerTask[]; first: SchedulerTask } => group.first != null)
    .sort((left, right) => compareSchedulerTasks(left.first, right.first));

  for (const group of supportedPending) {
    const selection = selectClaimPrefix(group.rows, decisions, remaining);
    claimGroups.push({
      agent_type: group.agentType,
      task_ids: selection.groupIds,
      would_claim: selection.wouldClaim,
      claimable: selection.wouldClaim > 0,
      reasons: selection.reasons,
    });
    selection.claimable.forEach((task) => claimableIds.add(task.id));
    selection.deferred.forEach((entry) => deferred.set(entry.task.id, entry.reasons));
    remaining -= selection.wouldClaim;
  }

  const claimable = eligible.filter((task) => claimableIds.has(task.id));
  const deferredTasks = eligible
    .filter((task) => !claimableIds.has(task.id))
    .map((task) => ({
      ...task,
      reasons: deferred.get(task.id) ?? ["deferred_capacity"],
    }));

  return {
    eligible,
    claimable,
    skipped,
    deferred: deferredTasks,
    claim_groups: claimGroups,
  };
}

function selectClaimPrefix(
  rows: readonly SchedulerTask[],
  decisions: ReadonlyMap<string, { eligible: boolean }>,
  budget: number,
): {
  claimable: SchedulerTask[];
  deferred: Array<{ task: SchedulerTask; reasons: string[] }>;
  groupIds: string[];
  wouldClaim: number;
  reasons: string[];
} {
  const claimable: SchedulerTask[] = [];
  const deferred: Array<{ task: SchedulerTask; reasons: string[] }> = [];
  const groupIds: string[] = [];
  let wouldClaim = 0;
  let cursor = 0;
  let blocked = false;

  while (cursor < rows.length) {
    const rank = rankAt(rows, cursor);
    const eligibleRank = rank.filter((task) => decisions.get(task.id)?.eligible);
    if (eligibleRank.length !== rank.length) {
      blocked = true;
      for (const task of rows.slice(cursor)) {
        if (decisions.get(task.id)?.eligible) {
          deferred.push({ task, reasons: ["blocked_by_earlier_pending_task"] });
        }
      }
      if (groupIds.length === 0) groupIds.push(...rank.map((task) => task.id));
      break;
    }

    if (budget <= 0) {
      for (const task of rows.slice(cursor)) {
        deferred.push({ task, reasons: ["deferred_capacity"] });
      }
      if (groupIds.length === 0) groupIds.push(...rank.map((task) => task.id));
      break;
    }

    groupIds.push(...rank.map((task) => task.id));
    if (rank.length > budget) {
      claimable.push(...rank);
      wouldClaim += budget;
      budget = 0;
      cursor += rank.length;
      continue;
    }

    claimable.push(...rank);
    wouldClaim += rank.length;
    budget -= rank.length;
    cursor += rank.length;
  }

  return {
    claimable,
    deferred,
    groupIds,
    wouldClaim,
    reasons: wouldClaim > 0 ? [] : [blocked ? "blocked_by_earlier_pending_task" : "deferred_capacity"],
  };
}

function rankAt(tasks: readonly SchedulerTask[], index: number): SchedulerTask[] {
  const first = tasks[index];
  if (!first) return [];
  const rank = [first];
  for (let cursor = index + 1; cursor < tasks.length; cursor += 1) {
    const task = tasks[cursor];
    if (!task || task.priority !== first.priority || task.created_at !== first.created_at) break;
    rank.push(task);
  }
  return rank;
}
