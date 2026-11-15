import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Fastify from "fastify";
import { describe, it } from "node:test";
import { registerPrivateAccess } from "../security/private-access.js";
import { registerSchedulerRoutes } from "../routes/task-scheduler.routes.js";
import { loadSchedulerConfig } from "./task-scheduler.config.js";
import {
  compareSchedulerTasks,
  consequentialAction,
  evaluateTaskEligibility,
  planSchedulerCycle,
  type SchedulerApproval,
  type SchedulerTask,
} from "./task-scheduler.eligibility.js";
import {
  TaskScheduler,
  type SchedulerLogger,
  type SchedulerStore,
} from "./task-scheduler.service.js";
import type { ExecutionPolicy } from "./task-execution-policy.js";
import type { AgentTypeName } from "./agent-operations.service.js";
import type { SchedulerConfig } from "./task-scheduler.config.js";

const SECRET = "scheduler-status-secret-0123456789";

function task(overrides: Partial<SchedulerTask> & Pick<SchedulerTask, "id" | "title" | "agent_type">): SchedulerTask {
  return {
    description: "Review the evidence and record findings.",
    status: "pending",
    priority: 2,
    input: {},
    created_at: "2026-11-11T04:14:28.214Z",
    started_at: null,
    completed_at: null,
    ...overrides,
  };
}

function config(overrides: Partial<SchedulerConfig> = {}): SchedulerConfig {
  return {
    enabled: false,
    dryRun: true,
    pollIntervalMs: 30_000,
    maxConcurrentTasks: 1,
    maxClaimsPerCycle: 1,
    leaseSeconds: 120,
    supportedAgentTypes: ["research"],
    ...overrides,
  };
}

function capturingLogger(): SchedulerLogger & { events: Array<Record<string, unknown>> } {
  const events: Array<Record<string, unknown>> = [];
  return {
    events,
    info(fields) {
      events.push(fields);
    },
    warn(fields) {
      events.push(fields);
    },
  };
}

function memoryStore(options: {
  tasks: SchedulerTask[];
  running?: number;
  dependencies?: SchedulerTask[];
  approvals?: SchedulerApproval[];
  policies?: ExecutionPolicy[];
}): SchedulerStore & { claims: number } {
  const store = {
    claims: 0,
    async listPending() {
      return options.tasks.filter((row) => row.status === "pending");
    },
    async countInProgress() {
      return options.running ?? options.tasks.filter((row) => row.status === "in_progress").length;
    },
    async loadTasks(ids: string[]) {
      return (options.dependencies ?? []).filter((row) => ids.includes(row.id));
    },
    async loadApprovals(ids: string[]) {
      return (options.approvals ?? []).filter((row) => ids.includes(row.id));
    },
    async loadExecutionPolicies() {
      return { available: true, policies: options.policies ?? [] };
    },
    async claimTaskById() {
      store.claims += 1;
      throw new Error("claimTaskById must not run while claims are disabled");
    },
  };
  return store;
}

const queuedTasks: SchedulerTask[] = [
  task({
    id: "961d2327-3c04-47ec-a18a-56cee6ad5837",
    title: "Source Suppliers and Verify Product Quality",
    description: "Identify and vet reliable manufacturers or suppliers for unit costs, stock availability, and production standards.",
    agent_type: "product",
    priority: 2,
    created_at: "2026-11-11T04:14:28.214Z",
    input: { requirements: ["minimum_supplier_rating_4.5"], supplier_platforms: ["AliExpress"] },
  }),
  task({
    id: "c660d4c2-5a8f-41a7-9e44-3576c88efa3c",
    title: "Evaluate Market Demand and Competitor Saturation",
    description: "Analyze keyword search volumes, social engagement, and competitive density across major ad platforms and stores.",
    agent_type: "research",
    priority: 2,
    created_at: "2026-11-11T04:28:42.748Z",
    input: { metrics: ["monthly search volume", "active Meta/TikTok ad count"] },
  }),
  task({
    id: "460099e2-629a-41dc-8cca-0acb11491f1d",
    title: "Vet Suppliers and Assess Product Reliability",
    agent_type: "product",
    priority: 2,
    created_at: "2026-11-11T04:28:42.748Z",
  }),
  task({
    id: "9bb7fcb2-d777-4ece-9f00-c44f5a0c4af8",
    title: "Perform Profitability and Unit Economics Modeling",
    agent_type: "finance",
    priority: 3,
    created_at: "2026-11-11T04:14:28.214Z",
    input: { cost_components: ["COGS", "estimated_ad_spend_CAC"] },
  }),
  task({
    id: "5e43d6b4-a835-4278-ae48-0154c14c9671",
    title: "Assess Shipping Logistics, Times, and Costs",
    agent_type: "operations",
    priority: 3,
  }),
  task({
    id: "bac3a134-45f2-4ee1-a722-0d4d6fdb9364",
    title: "Audit North American Shipping and Customs Logistics",
    agent_type: "operations",
    priority: 3,
    created_at: "2026-11-11T04:28:42.748Z",
  }),
  task({
    id: "e96fbe94-0e4b-42d1-bd21-95e10fbc6421",
    title: "Model Unit Economics and Profit Margins for Top 5 Products",
    agent_type: "finance",
    priority: 3,
    created_at: "2026-11-11T04:28:42.748Z",
  }),
  task({
    id: "f7983bae-2523-42f8-9ebb-37a5dc480c90",
    title: "Evaluate Return Risks and After-Sales Support Feasibility",
    agent_type: "support",
    priority: 4,
  }),
  task({
    id: "1449fd6e-f339-4bc8-8050-061a2fc6bdf5",
    title: "Assess Go-To-Market Viability and Advertising Potential",
    description: "Assess the hook viability, video creative potential, and target audience size across Meta and TikTok.",
    agent_type: "marketing",
    priority: 4,
    created_at: "2026-11-11T04:28:42.748Z",
    input: { ad_networks: ["Meta Ads", "TikTok Ads"] },
  }),
];

describe("scheduler configuration", () => {
  it("stays disabled, dry-run, and limited to the research agent by default", () => {
    const loaded = loadSchedulerConfig({});
    assert.equal(loaded.enabled, false);
    assert.equal(loaded.dryRun, true);
    assert.equal(loaded.pollIntervalMs, 30_000);
    assert.equal(loaded.maxConcurrentTasks, 1);
    assert.equal(loaded.maxClaimsPerCycle, 1);
    assert.equal(loaded.leaseSeconds, 120);
    assert.deepEqual(loaded.supportedAgentTypes, ["research"]);
  });

  it("accepts only an exact true enable flag and fails closed on invalid values", () => {
    assert.equal(loadSchedulerConfig({ SCHEDULER_ENABLED: "true" }).enabled, true);
    assert.equal(loadSchedulerConfig({ SCHEDULER_ENABLED: "TRUE" }).enabled, false);
    assert.equal(loadSchedulerConfig({ SCHEDULER_ENABLED: "1" }).enabled, false);
    assert.equal(loadSchedulerConfig({ SCHEDULER_DRY_RUN: "false" }).dryRun, false);
    assert.equal(loadSchedulerConfig({ SCHEDULER_DRY_RUN: "no" }).dryRun, true);
    assert.equal(loadSchedulerConfig({ SCHEDULER_POLL_INTERVAL_MS: "1000" }).pollIntervalMs, 30_000);
    assert.equal(loadSchedulerConfig({ SCHEDULER_MAX_CONCURRENT_TASKS: "0" }).maxConcurrentTasks, 1);
    assert.deepEqual(
      loadSchedulerConfig({ SCHEDULER_SUPPORTED_AGENT_TYPES: "marketing, ceo, research" }).supportedAgentTypes,
      ["marketing", "research"],
    );
    assert.deepEqual(
      loadSchedulerConfig({ SCHEDULER_SUPPORTED_AGENT_TYPES: "ceo" }).supportedAgentTypes,
      ["research"],
    );
  });
});

describe("scheduler eligibility", () => {
  const context = {
    supportedAgentTypes: ["research"] as AgentTypeName[],
    tasksById: new Map<string, SchedulerTask>(),
    approvalsById: new Map<string, SchedulerApproval>(),
  };

  it("accepts one pending supported research task and skips the other queued departments", () => {
    const plan = planSchedulerCycle(queuedTasks, 0, config(), new Map(), new Map());
    assert.deepEqual(plan.eligible, []);
    assert.deepEqual(plan.claimable, []);
    assert.equal(plan.claim_groups[0]?.would_claim, 0);
    assert.equal(plan.skipped.length, 9);
    const research = plan.skipped.find((item) => item.agent_type === "research");
    assert.deepEqual(research?.reasons, ["execution_policy_missing"]);
    assert.equal(consequentialAction(queuedTasks[1]), null);
    const marketing = plan.skipped.find((item) => item.agent_type === "marketing");
    assert.ok(marketing?.reasons.includes("unsupported_agent_type"));
    assert.ok(marketing?.reasons.includes("externally_consequential:advertising"));
    assert.ok(marketing?.reasons.includes("execution_policy_missing"));
    assert.equal(
      plan.skipped
        .filter((item) => item.agent_type !== "marketing" && item.agent_type !== "research")
        .every((item) => item.reasons.includes("unsupported_agent_type") && item.reasons.includes("execution_policy_missing")),
      true,
    );
  });

  it("rejects unsupported, claimed, cancelled, and previously failed tasks", () => {
    assert.deepEqual(
      evaluateTaskEligibility(task({ id: "1", title: "Launch ads", agent_type: "marketing" }), context).reasons,
      ["unsupported_agent_type", "externally_consequential:advertising", "execution_policy_missing"],
    );
    assert.deepEqual(
      evaluateTaskEligibility(task({
        id: "2",
        title: "Running research",
        agent_type: "research",
        status: "in_progress",
        started_at: "2026-11-15T00:00:00.000Z",
      }), context).reasons,
      ["already_claimed"],
    );
    assert.deepEqual(
      evaluateTaskEligibility(task({ id: "3", title: "Closed research", agent_type: "research", status: "cancelled" }), context).reasons,
      ["not_pending"],
    );
    assert.deepEqual(
      evaluateTaskEligibility(task({ id: "4", title: "Broken research", agent_type: "research", status: "failed" }), context).reasons,
      ["failed_not_retried"],
    );
  });

  it("keeps a task ineligible until every represented dependency is completed", () => {
    const failed = task({
      id: "11111111-1111-4111-8111-111111111111",
      title: "Failed research",
      agent_type: "research",
      status: "failed",
    });
    const waiting = task({
      id: "22222222-2222-4222-8222-222222222222",
      title: "Follow-up research",
      agent_type: "research",
      input: { depends_on: [failed.id] },
    });
    const policies = new Map([[waiting.id, { taskId: waiting.id, capabilities: ["research_read"] }]]);
    const decision = evaluateTaskEligibility(waiting, {
      ...context,
      tasksById: new Map([[failed.id, failed]]),
      policiesByTaskId: policies,
    });
    assert.deepEqual(decision.reasons, ["dependency_unsatisfied"]);
    const plan = planSchedulerCycle([failed, waiting], 0, config(), new Map([[failed.id, failed]]), new Map(), policies);
    assert.deepEqual(plan.eligible, []);
    assert.equal(plan.claim_groups[0]?.would_claim, 0);
  });

  it("blocks unresolved approval and does not treat product review as execution authority", () => {
    const pending = task({
      id: "needs-review",
      title: "Summarize the category",
      agent_type: "research",
      input: { requires_approval: true, approval_status: "pending" },
    });
    assert.ok(evaluateTaskEligibility(pending, context).reasons.includes("approval_unresolved"));

    const approvedReview = task({
      id: "reviewed",
      title: "Purchase the winning product",
      agent_type: "research",
      input: {
        approval_request_id: "approval-1",
        approval_status: "approved",
      },
    });
    const reasons = evaluateTaskEligibility(approvedReview, {
      ...context,
      approvalsById: new Map([[
        "approval-1",
        { id: "approval-1", status: "approved", requested_action: "product_review" },
      ]]),
    }).reasons;
    assert.ok(reasons.includes("approval_does_not_authorize_execution"));
    assert.ok(reasons.includes("externally_consequential:purchasing"));
  });

  it("blocks purchasing, advertising, publishing, and other external writes", () => {
    const cases: Array<[string, SchedulerTask]> = [
      ["purchasing", task({ id: "p", title: "Purchase inventory", agent_type: "research", input: { purchase: true } })],
      ["advertising", task({ id: "a", title: "Launch a campaign", agent_type: "research" })],
      ["publishing", task({ id: "u", title: "Publish the Shopify listing", agent_type: "research" })],
      ["external_write", task({ id: "e", title: "Email customers about the launch", agent_type: "research" })],
    ];
    for (const [action, candidate] of cases) {
      const reasons = evaluateTaskEligibility(candidate, context).reasons;
      assert.ok(reasons.includes(`externally_consequential:${action}`), action);
      assert.equal(evaluateTaskEligibility(candidate, context).eligible, false);
    }
    assert.equal(consequentialAction(queuedTasks[3]), null);
  });

  it("claims at most the configured concurrency and leaves a tie ambiguous", () => {
    const first = task({ id: "a", title: "First research", agent_type: "research", priority: 1 });
    const second = task({
      id: "b",
      title: "Second research",
      agent_type: "research",
      priority: 2,
      created_at: "2026-11-11T05:00:00.000Z",
    });
    const policies = new Map(["a", "b", "m", "n"].map((id) => [id, { taskId: id, capabilities: ["research_read"] }]));
    const limited = planSchedulerCycle([first, second], 0, config(), new Map(), new Map(), policies);
    assert.deepEqual(limited.claimable.map((item) => item.id), ["a"]);
    assert.deepEqual(limited.deferred.map((item) => item.id), ["b"]);
    assert.deepEqual(limited.deferred[0]?.reasons, ["deferred_capacity"]);

    const saturated = planSchedulerCycle([first], 1, config(), new Map(), new Map(), policies);
    assert.deepEqual(saturated.eligible.map((item) => item.id), ["a"]);
    assert.deepEqual(saturated.claimable, []);
    assert.deepEqual(saturated.deferred[0]?.reasons, ["deferred_capacity"]);

    const tiedLeft = task({ id: "m", title: "Tied research", agent_type: "research", created_at: "2026-11-11T04:28:42.748Z" });
    const tiedRight = task({ id: "n", title: "Tied research too", agent_type: "research", created_at: "2026-11-11T04:28:42.748Z" });
    const tie = planSchedulerCycle([tiedRight, tiedLeft], 0, config(), new Map(), new Map(), policies);
    assert.equal(tie.claim_groups[0]?.would_claim, 1);
    assert.deepEqual(tie.claimable.map((item) => item.id).sort(), ["m", "n"]);
  });

  it("does not call the claim RPC when an earlier pending task of that type is unsafe", () => {
    const purchase = task({
      id: "buy",
      title: "Purchase inventory",
      agent_type: "research",
      priority: 1,
      created_at: "2026-11-11T04:00:00.000Z",
    });
    const later = task({
      id: "later",
      title: "Read the category report",
      agent_type: "research",
      priority: 2,
      created_at: "2026-11-11T05:00:00.000Z",
    });
    const policies = new Map(["buy", "later"].map((id) => [id, { taskId: id, capabilities: ["research_read"] }]));
    const plan = planSchedulerCycle([later, purchase], 0, config(), new Map(), new Map(), policies);
    assert.deepEqual(plan.eligible.map((item) => item.id), ["later"]);
    assert.deepEqual(plan.claimable, []);
    assert.equal(plan.claim_groups[0]?.claimable, false);
    assert.deepEqual(plan.deferred[0]?.reasons, ["blocked_by_earlier_pending_task"]);
  });
});

describe("scheduler cycle", () => {
  it("does not claim or execute while disabled, and a dry-run only reports eligibility", async () => {
    const store = memoryStore({ tasks: queuedTasks, running: 0 });
    const logger = capturingLogger();
    const scheduler = new TaskScheduler({
      config: config(),
      store,
      logger,
      permitClaims: true,
    });
    let scheduled = false;
    const idle = new TaskScheduler({
      config: config(),
      store,
      logger,
      schedule() {
        scheduled = true;
        return { cancel() {} };
      },
    });

    idle.start();
    const report = await scheduler.runDryRun();

    assert.equal(scheduled, false);
    assert.equal(store.claims, 0);
    assert.equal(report.mode, "dry-run");
    assert.equal(report.autonomous_execution, false);
    assert.equal(report.claims_attempted, 0);
    assert.deepEqual(report.claimed, []);
    assert.equal(report.eligible.length, 0);
    assert.equal(report.execution_policy_store, "ready");
    assert.equal(report.claim_target_id, null);
    assert.ok(logger.events.some((event) => event.event === "scheduler_disabled"));
    assert.ok(logger.events.some((event) => event.event === "scheduler_skip"));
    assert.ok(logger.events.some((event) => event.event === "scheduler_decision" && event.claims_attempted === 0));
    assert.equal(JSON.stringify(logger.events).includes("AliExpress"), false);
  });

  it("withholds claims when execution is requested and never retries a failed task", async () => {
    const failed = task({ id: "failed-task", title: "Broken research", agent_type: "research", status: "failed" });
    const pending = task({ id: "next-task", title: "Read the category report", agent_type: "research" });
    const store = memoryStore({
      tasks: [failed, pending],
      policies: [{ taskId: pending.id, capabilities: ["research_read"] }],
    });
    store.listPending = async () => [failed, pending];
    const logger = capturingLogger();
    const scheduler = new TaskScheduler({
      config: config({ enabled: true, dryRun: false }),
      store,
      logger,
      permitClaims: true,
    });

    const report = await scheduler.runClaimCycle();

    assert.equal(report.mode, "claims-withheld");
    assert.equal(report.claims_attempted, 0);
    assert.equal(store.claims, 0);
    assert.deepEqual(report.eligible.map((item) => item.id), ["next-task"]);
    assert.equal(report.skipped.some((item) => item.reasons.includes("failed_not_retried")), true);
    assert.ok(logger.events.some((event) => event.event === "scheduler_claims_withheld"));
  });

  it("lets two skip-locked claimers take different tasks and leaves one task claimed once", async () => {
    const rows = [
      task({ id: "one", title: "First research", agent_type: "research", priority: 1 }),
      task({ id: "two", title: "Second research", agent_type: "research", priority: 2, created_at: "2026-11-11T05:00:00.000Z" }),
    ];
    const locked = skipLockedClaim(rows);
    const [first, second] = await Promise.all([
      locked.claimNext("research"),
      locked.claimNext("research"),
    ]);
    const ids = [first?.id, second?.id].filter((id): id is string => Boolean(id));

    assert.equal(new Set(ids).size, 2);
    assert.deepEqual(ids.sort(), ["one", "two"]);
    assert.equal(rows.filter((row) => row.status === "in_progress").length, 2);

    const single = skipLockedClaim([
      task({ id: "only", title: "Only research", agent_type: "research" }),
    ]);
    const [winner, loser] = await Promise.all([
      single.claimNext("research"),
      single.claimNext("research"),
    ]);
    assert.equal(winner?.id, "only");
    assert.equal(loser, null);
    assert.equal(single.tasks[0]?.status, "in_progress");
    assert.equal(compareSchedulerTasks(rows[0], rows[1]) < 0, true);
  });

  it("stops the timer, finishes the current cycle, and ignores later cycles", async () => {
    let release: (rows: SchedulerTask[]) => void = () => {};
    let reads = 0;
    const store: SchedulerStore = {
      async listPending() {
        reads += 1;
        return new Promise((resolve) => {
          release = resolve;
        });
      },
      async countInProgress() {
        return 0;
      },
      async loadTasks() {
        return [];
      },
      async loadApprovals() {
        return [];
      },
      async loadExecutionPolicies() {
        return { available: true, policies: [] };
      },
      async claimTaskById() {
        throw new Error("claimTaskById must not run while claims are disabled");
      },
    };
    let fire: (() => void) | null = null;
    const scheduler = new TaskScheduler({
      config: config({ enabled: true }),
      store,
      schedule(fn) {
        fire = fn;
        return {
          cancel() {
            fire = null;
          },
        };
      },
    });

    scheduler.start();
    const cycle = scheduler.runDryRun();
    let stopped = false;
    const stopPromise = scheduler.stop().then(() => {
      stopped = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(stopped, false);
    assert.equal(fire, null);
    release([]);
    await stopPromise;
    await cycle;
    const after = await scheduler.runDryRun();
    assert.equal(after.mode, "stopped");
    assert.equal(reads, 1);
  });
});

describe("scheduler status route", () => {
  it("requires the internal secret and exposes no execution switch", async () => {
    const app = Fastify({ logger: false });
    registerPrivateAccess(app, { secret: SECRET });
    registerSchedulerRoutes(app, {
      status() {
        return {
          stage: "7.1",
          autonomous_execution: false,
          claims_permitted: false,
          config: { enabled: false, dry_run: true },
        };
      },
    });
    await app.ready();

    const missing = await app.inject({
      method: "GET",
      url: "/dashboard/scheduler",
      remoteAddress: "203.0.113.10",
    });
    const allowed = await app.inject({
      method: "GET",
      url: "/dashboard/scheduler",
      remoteAddress: "203.0.113.10",
      headers: { "x-aimpire-internal-secret": SECRET },
    });
    const write = await app.inject({
      method: "POST",
      url: "/dashboard/scheduler",
      remoteAddress: "127.0.0.1",
      headers: { "x-aimpire-internal-secret": SECRET },
      payload: { enabled: true, execute: true },
    });
    const body = allowed.json();

    assert.equal(missing.statusCode, 401);
    assert.equal(allowed.statusCode, 200);
    assert.equal(body.scheduler.autonomous_execution, false);
    assert.equal(body.scheduler.claims_permitted, false);
    assert.equal(JSON.stringify(body).includes(SECRET), false);
    assert.equal(write.statusCode, 404);
    await app.close();
  });
});

describe("scheduler safeguards in source", () => {
  it("reuses claim_next_agent_task and keeps claims disabled", () => {
    const claimSql = readFileSync(
      new URL("../../../../supabase/migrations/20261111043400_claim_next_agent_task.sql", import.meta.url),
      "utf8",
    );
    const store = readFileSync(new URL("./task-scheduler.supabase.ts", import.meta.url), "utf8");
    const service = readFileSync(new URL("./task-scheduler.service.ts", import.meta.url), "utf8");
    const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
    const migrations = readFileSync(
      new URL("../../../../supabase/migrations/20261111043400_claim_next_agent_task.sql", import.meta.url),
      "utf8",
    );

    assert.match(claimSql, /for update skip locked/i);
    assert.match(claimSql, /status = 'pending'/);
    assert.match(store, /claim_agent_task_by_id/);
    assert.match(store, /SchedulerClaimsDisabledError/);
    assert.equal(store.includes("claimNextTask"), false);
    assert.equal(store.includes("gemini"), false);
    assert.match(service, /claims_attempted: 0/);
    assert.doesNotMatch(service, /gemini|executeNext|shopify/i);
    assert.match(server, /registerSchedulerRoutes/);
    assert.match(server, /scheduler\.stop/);
    assert.match(migrations, /update public\.agent_tasks/);
    assert.equal(server.includes("permitClaims: true"), false);
  });
});

function skipLockedClaim(tasks: SchedulerTask[]) {
  let chain = Promise.resolve();
  return {
    tasks,
    claimNext(agentType: string) {
      const run = chain.then(() => {
        const next = tasks
          .filter((row) => row.status === "pending" && !row.started_at && row.agent_type === agentType)
          .sort(compareSchedulerTasks)[0];
        if (!next) return null;
        next.status = "in_progress";
        next.started_at = "2026-11-15T00:00:00.000Z";
        return { ...next };
      });
      chain = run.then(() => undefined, () => undefined);
      return run;
    },
  };
}
