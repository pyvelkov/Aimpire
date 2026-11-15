import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { AGENT_TYPES } from "./agent-operations.service.js";
import { DashboardDataError } from "./dashboard-read.service.js";
import {
  AGENT_PROFILE_HISTORY_DEFAULT,
  AGENT_PROFILE_HISTORY_MAX,
  AgentProfileService,
  ProfileNotFoundError,
  clampHistoryLimit,
  type AgentProfileDb,
  type AgentProfileRow,
  type ProfileTaskRow,
} from "./agent-profile.service.js";

const RESEARCH_ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT_ID = "22222222-2222-4222-8222-222222222222";
const TASK_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TASK_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TASK_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TASK_D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const FOREIGN_TASK = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function profile(overrides: Partial<AgentProfileRow> = {}): AgentProfileRow {
  return {
    id: RESEARCH_ID,
    agent_type: "research",
    display_name: "Nova",
    description: "Nova reads the saved evidence.",
    responsibilities: "Study markets and suppliers.",
    specialization: "Market and supplier research",
    avatar_id: "nova",
    created_at: "2026-11-15T12:00:00.000Z",
    updated_at: "2026-11-15T12:00:00.000Z",
    ...overrides,
  };
}

function task(overrides: Partial<ProfileTaskRow> & Pick<ProfileTaskRow, "id" | "status">): ProfileTaskRow {
  return {
    title: overrides.title ?? overrides.id,
    agent_type: overrides.agent_type ?? "research",
    created_at: overrides.created_at ?? "2026-11-15T12:00:00.000Z",
    started_at: overrides.started_at ?? null,
    completed_at: overrides.completed_at ?? null,
    error_message: overrides.error_message ?? null,
    ...overrides,
  };
}

function stamp(row: ProfileTaskRow, status: string): number {
  const raw = status === "in_progress"
    ? row.started_at ?? row.created_at
    : status === "pending"
      ? row.created_at
      : row.completed_at ?? row.created_at;
  const parsed = raw ? Date.parse(raw) : Number.NaN;
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function memoryDb(options: {
  profiles?: AgentProfileRow[];
  tasks?: ProfileTaskRow[];
  counts?: Record<string, number>;
  current?: ProfileTaskRow | null;
  foreignCompleted?: boolean;
} = {}): AgentProfileDb & { calls: string[] } {
  const profiles = options.profiles ?? [];
  const tasks = options.tasks ?? [];
  const calls: string[] = [];

  return {
    calls,
    async listProfiles() {
      calls.push("profiles");
      return profiles;
    },
    async getProfile(id) {
      calls.push(`profile:${id}`);
      return profiles.find((row) => row.id === id) ?? null;
    },
    async countTasks(agentType, status) {
      calls.push(`count:${agentType}:${status}`);
      const override = options.counts?.[`${agentType}:${status}`];
      if (override != null) {
        return override;
      }
      return tasks.filter((row) => row.agent_type === agentType && row.status === status).length;
    },
    async listTasks(agentType, status, limit) {
      calls.push(`list:${agentType}:${status}:${limit}`);
      const rows = tasks
        .filter((row) => row.agent_type === agentType && row.status === status)
        .sort((left, right) => stamp(right, status) - stamp(left, status))
        .slice(0, limit);
      if (options.foreignCompleted && agentType === "research" && status === "completed") {
        rows.push(task({
          id: FOREIGN_TASK,
          agent_type: "product",
          status: "completed",
          title: "Compare suppliers",
          completed_at: "2026-11-15T14:00:00.000Z",
        }));
      }
      return rows;
    },
    async currentRunningTask(agentType) {
      calls.push(`current:${agentType}`);
      if (options.current && options.current.agent_type === agentType) {
        return options.current;
      }
      return tasks.find((row) => row.agent_type === agentType && row.status === "in_progress") ?? null;
    },
  };
}

describe("agent profile history", () => {
  it("keeps history bounded to the requested department", async () => {
    const db = memoryDb({
      profiles: [profile(), profile({
        id: PRODUCT_ID,
        agent_type: "product",
        display_name: "Quinn",
        avatar_id: "quinn",
        specialization: "Product evaluation",
      })],
      tasks: [
        task({
          id: TASK_A,
          status: "completed",
          title: "Read the listing",
          created_at: "2026-11-14T10:00:00.000Z",
          completed_at: "2026-11-15T13:00:00.000Z",
        }),
        task({
          id: TASK_B,
          status: "completed",
          title: "Older note",
          created_at: "2026-11-13T10:00:00.000Z",
          completed_at: "2026-11-14T13:00:00.000Z",
        }),
        task({
          id: TASK_C,
          status: "failed",
          title: "Missing source",
          error_message: "The page timed out",
          completed_at: "2026-11-15T12:30:00.000Z",
        }),
        task({
          id: TASK_D,
          status: "in_progress",
          title: "Check the new shelf",
          started_at: "2026-11-15T14:00:00.000Z",
        }),
        task({
          id: FOREIGN_TASK,
          agent_type: "product",
          status: "completed",
          title: "Compare suppliers",
          completed_at: "2026-11-15T15:00:00.000Z",
        }),
      ],
      foreignCompleted: true,
    });

    const profiles = await new AgentProfileService(db).list(2);
    const nova = profiles.find((entry) => entry.agent_type === "research");
    const quinn = profiles.find((entry) => entry.agent_type === "product");
    const serialized = JSON.stringify(nova);

    assert.deepEqual(profiles.map((entry) => entry.agent_type), ["research", "product"]);
    assert.equal(nova?.display_name, "Nova");
    assert.equal(nova?.department, "Research");
    assert.equal(nova?.task_counts.completed, 2);
    assert.equal(nova?.progression.total_xp, 50);
    assert.equal(nova?.progression.level, 1);
    assert.equal(nova?.progression.achievements[0]?.earned, true);
    assert.equal(nova?.progression.achievements[1]?.earned, false);
    assert.equal(nova?.task_counts.in_progress, 1);
    assert.equal(nova?.task_counts.failed, 1);
    assert.equal(nova?.task_counts.total, 4);
    assert.equal(nova?.current_task?.title, "Check the new shelf");
    assert.deepEqual(nova?.completed_tasks.map((entry) => entry.title), ["Read the listing", "Older note"]);
    assert.equal(nova?.failed_tasks[0]?.title, "Missing source");
    assert.equal(nova?.failed_tasks[0]?.error_message, "The page timed out");
    assert.equal(nova?.recent_tasks.length, 2);
    assert.equal(serialized.includes("Compare suppliers"), false);
    assert.equal(quinn?.task_counts.completed, 1);
    assert.equal(quinn?.completed_tasks[0]?.title, "Compare suppliers");
    assert.equal(db.calls.some((call) => call.startsWith("count:marketing")), false);
    assert.equal(Object.hasOwn(nova ?? {}, "activity"), false);
    assert.equal(Object.hasOwn(nova ?? {}, "runs"), false);
    assert.equal(serialized.includes("agent_runs"), false);
    assert.equal(serialized.includes("activity_logs"), false);
  });

  it("returns an empty history without inventing tasks", async () => {
    const view = await new AgentProfileService(memoryDb({
      profiles: [profile()],
    })).get(RESEARCH_ID);

    assert.equal(view.display_name, "Nova");
    assert.equal(view.task_counts.total, 0);
    assert.equal(view.task_counts.pending, 0);
    assert.equal(view.task_counts.in_progress, 0);
    assert.equal(view.task_counts.completed, 0);
    assert.equal(view.task_counts.failed, 0);
    assert.equal(view.task_counts.cancelled, 0);
    assert.equal(view.current_task, null);
    assert.deepEqual(view.recent_tasks, []);
    assert.deepEqual(view.completed_tasks, []);
    assert.deepEqual(view.failed_tasks, []);
    assert.equal(JSON.stringify(view).includes("Working on"), false);
    assert.equal(view.progression.total_xp, 0);
    assert.equal(view.progression.level, 1);
    assert.equal(view.progression.xp_toward_next_level, 0);
    assert.equal(view.progression.completed_task_count, 0);
    assert.equal(view.progression.achievements.every((achievement) => !achievement.earned), true);
    assert.equal(Object.hasOwn(view, "experience_points"), false);
  });

  it("credits older completed tasks and gives the other statuses no XP", async () => {
    const view = await new AgentProfileService(memoryDb({
      profiles: [profile()],
      tasks: [
        task({
          id: TASK_A,
          status: "completed",
          title: "Old research",
          created_at: "2024-01-01T00:00:00.000Z",
          completed_at: "2024-02-01T00:00:00.000Z",
        }),
        task({
          id: TASK_B,
          status: "completed",
          title: "Later research",
          completed_at: "2026-11-01T00:00:00.000Z",
        }),
        task({
          id: TASK_C,
          status: "completed",
          title: "Third note",
          completed_at: "2026-11-02T00:00:00.000Z",
        }),
        task({
          id: TASK_D,
          status: "completed",
          title: "Fourth note",
          completed_at: "2026-11-03T00:00:00.000Z",
        }),
        task({
          id: "77777777-7777-4777-8777-777777777777",
          status: "completed",
          title: "Fifth note",
          completed_at: "2026-11-04T00:00:00.000Z",
        }),
        task({ id: FOREIGN_TASK, status: "pending", title: "Still queued" }),
        task({
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          status: "failed",
          title: "Failed once",
          completed_at: "2026-11-04T00:00:00.000Z",
        }),
        task({
          id: "99999999-9999-4999-8999-999999999999",
          status: "cancelled",
          title: "Cancelled",
        }),
        task({
          id: "88888888-8888-4888-8888-888888888888",
          status: "in_progress",
          title: "Still running",
          started_at: "2026-11-06T00:00:00.000Z",
        }),
      ],
    })).get(RESEARCH_ID);

    assert.equal(view.task_counts.completed, 5);
    assert.equal(view.task_counts.pending, 1);
    assert.equal(view.task_counts.failed, 1);
    assert.equal(view.task_counts.cancelled, 1);
    assert.equal(view.task_counts.in_progress, 1);
    assert.equal(view.progression.total_xp, 125);
    assert.equal(view.progression.level, 2);
    assert.equal(view.progression.xp_toward_next_level, 25);
    assert.equal(view.progression.achievements[0]?.earned, true);
    assert.equal(view.progression.achievements[1]?.earned, true);
    assert.equal(view.progression.achievements[2]?.earned, false);
  });

  it("counts a repeated completed id only once", async () => {
    const duplicate = task({
      id: TASK_A,
      status: "completed",
      title: "Only once",
      completed_at: "2024-02-01T00:00:00.000Z",
    });
    const db = memoryDb({
      profiles: [profile()],
      tasks: [duplicate],
      counts: { "research:completed": 1 },
    });
    const listTasks = db.listTasks.bind(db);
    db.listTasks = async (agentType, status, limit) => {
      if (status === "completed") {
        return [duplicate, { ...duplicate }, { ...duplicate }];
      }
      return listTasks(agentType, status, limit);
    };

    const view = await new AgentProfileService(db).get(RESEARCH_ID);
    assert.equal(view.task_counts.completed, 1);
    assert.equal(view.completed_tasks.length, 1);
    assert.equal(view.progression.total_xp, 25);
    assert.equal(view.progression.level, 1);
  });

  it("does not turn a stray running row into current work when the count is zero", async () => {
    const view = await new AgentProfileService(memoryDb({
      profiles: [profile()],
      counts: { "research:in_progress": 0 },
      current: task({
        id: TASK_D,
        status: "in_progress",
        title: "Check the new shelf",
        started_at: "2026-11-15T14:00:00.000Z",
      }),
    })).get(RESEARCH_ID);

    assert.equal(view.task_counts.in_progress, 0);
    assert.equal(view.current_task, null);
  });

  it("omits departments that have no profile and ignores unknown rows", async () => {
    const db = memoryDb({
      profiles: [profile({
        id: "99999999-9999-4999-8999-999999999999",
        agent_type: "ceo",
        display_name: "Ghost",
      })],
      tasks: [task({ id: TASK_A, status: "completed", title: "Should stay unread" })],
    });

    const profiles = await new AgentProfileService(db).list();
    assert.deepEqual(profiles, []);
    assert.equal(db.calls.some((call) => call.startsWith("count:")), false);
    await assert.rejects(
      () => new AgentProfileService(db).get("99999999-9999-4999-8999-999999999999"),
      (error: unknown) => error instanceof ProfileNotFoundError,
    );
    await assert.rejects(
      () => new AgentProfileService(db).get(PRODUCT_ID),
      (error: unknown) => error instanceof ProfileNotFoundError,
    );
  });

  it("rejects a blank identity and a duplicate department", async () => {
    await assert.rejects(
      () => new AgentProfileService(memoryDb({
        profiles: [profile({ display_name: "  " })],
      })).get(RESEARCH_ID),
      (error: unknown) => error instanceof DashboardDataError,
    );
    await assert.rejects(
      () => new AgentProfileService(memoryDb({
        profiles: [profile(), profile({ id: PRODUCT_ID })],
      })).list(),
      (error: unknown) => error instanceof DashboardDataError,
    );
  });

  it("uses the saved name for a known department", async () => {
    const view = await new AgentProfileService(memoryDb({
      profiles: [profile({ display_name: "Nova Vale" })],
    })).get(RESEARCH_ID);

    assert.equal(view.display_name, "Nova Vale");
    assert.equal(view.agent_type, "research");
    assert.equal(view.department, "Research");
    assert.equal(view.avatar_id, "nova");
  });

  it("clamps the history window", () => {
    assert.equal(clampHistoryLimit(undefined), AGENT_PROFILE_HISTORY_DEFAULT);
    assert.equal(clampHistoryLimit(2), 2);
    assert.equal(clampHistoryLimit(0), AGENT_PROFILE_HISTORY_DEFAULT);
    assert.equal(clampHistoryLimit(100), AGENT_PROFILE_HISTORY_MAX);
  });
});

describe("agent profile migration", () => {
  it("seeds six unique departments and does not store progression or task history", () => {
    const sql = readFileSync(
      new URL("../../../../supabase/migrations/20261115064509_agent_profiles.sql", import.meta.url),
      "utf8",
    );
    const expected = [
      ["research", "Nova", "nova"],
      ["product", "Quinn", "quinn"],
      ["marketing", "Rio", "rio"],
      ["finance", "Jules", "jules"],
      ["operations", "Sage", "sage"],
      ["support", "Wynn", "wynn"],
    ] as const;

    assert.deepEqual([...AGENT_TYPES], expected.map(([agentType]) => agentType));
    for (const [agentType, name, avatar] of expected) {
      assert.match(sql, new RegExp(`'${agentType}',\\s*'${name}'`));
      assert.equal(sql.split(`'${name}'`).length - 1, 1);
      assert.match(sql, new RegExp(`'${avatar}'`));
    }
    assert.match(sql, /unique \(agent_type\)/);
    assert.match(sql, /unique \(avatar_id\)/);
    assert.match(sql, /on conflict \(agent_type\) do nothing/i);
    assert.match(sql, /enable row level security/);
    assert.match(sql, /revoke all on table public\.agent_profiles from public, anon, authenticated, service_role/);
    assert.match(sql, /grant select on table public\.agent_profiles to service_role/);
    assert.doesNotMatch(sql, /create policy/i);
    assert.doesNotMatch(sql, /grant (insert|update|delete|all)\b/i);
    assert.doesNotMatch(sql, /security definer/i);
    assert.doesNotMatch(sql, /experience_points|achievement|\bxp\b/i);
    assert.doesNotMatch(sql, /alter table[^\n]*agent_tasks/i);
    assert.doesNotMatch(sql, /agent_runs|activity_logs/);
    assert.match(sql, /touch_agent_profile_updated_at/);

    const source = readFileSync(new URL("./agent-profile.supabase.ts", import.meta.url), "utf8");
    assert.match(source, /from\("agent_profiles"\)/);
    assert.match(source, /\.eq\("agent_type", agentType\)/);
    assert.match(source, /\.limit\(/);
    assert.doesNotMatch(source, /agent_runs|activity_logs|\.insert\(|\.update\(|\.delete\(/);
  });
});
