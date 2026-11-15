import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dashboardRequestUrl } from "../dashboard-resources";
import { DEPARTMENTS } from "./departments";
import {
  agentProfileHistoryQuery,
  isAgentProfileId,
  loadAgentProfile,
  loadAgentProfiles,
  parseAgentProfileList,
  parseStoredAgentProfileList,
  profileForDepartment,
  type AgentProfile,
} from "./profiles";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const TASK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function profile(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: PROFILE_ID,
    agent_type: "research",
    department: "Research",
    display_name: "Nova",
    description: "Nova reads the saved evidence.",
    responsibilities: "Study markets and suppliers.",
    specialization: "Market and supplier research",
    avatar_id: "nova",
    created_at: "2026-11-15T12:00:00.000Z",
    updated_at: "2026-11-15T12:00:00.000Z",
    task_counts: {
      total: 0,
      pending: 0,
      in_progress: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    },
    current_task: null,
    recent_tasks: [],
    completed_tasks: [],
    failed_tasks: [],
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("agent profile records", () => {
  it("accepts empty saved history and real task rows", () => {
    const empty = parseStoredAgentProfileList({ success: true, profiles: [profile()] });
    assert.equal(empty?.[0]?.recent_tasks.length, 0);
    assert.equal(empty?.[0]?.current_task, null);
    assert.equal(empty?.[0]?.task_counts.total, 0);

    const task = {
      id: TASK_ID,
      title: "Read the listing",
      status: "completed" as const,
      status_label: "Completed",
      created_at: "2026-11-14T12:00:00.000Z",
      started_at: "2026-11-15T12:00:00.000Z",
      completed_at: "2026-11-15T13:00:00.000Z",
      last_activity_at: "2026-11-15T13:00:00.000Z",
      error_message: null,
    };
    const running = { ...task, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", status: "in_progress" as const, status_label: "Running", title: "Check the shelf" };
    const saved = parseAgentProfileList({
      profiles: [profile({
        task_counts: { total: 2, pending: 0, in_progress: 1, completed: 1, failed: 0, cancelled: 0 },
        current_task: running,
        recent_tasks: [running, task],
        completed_tasks: [task],
        failed_tasks: [],
      })],
    });

    assert.equal(saved?.[0]?.completed_tasks[0]?.title, "Read the listing");
    assert.equal(saved?.[0]?.current_task?.title, "Check the shelf");
    assert.equal(profileForDepartment(saved ?? [], "research")?.display_name, "Nova");
    assert.equal(profileForDepartment(saved ?? [], "finance"), null);
  });

  it("rejects fabricated activity, progression, and a mismatched department", () => {
    const base = profile();
    assert.equal(parseStoredAgentProfileList({
      success: true,
      activity: [{ description: "Invented run" }],
      profiles: [base],
    })?.[0]?.display_name, "Nova");
    assert.equal(JSON.stringify(parseStoredAgentProfileList({
      success: true,
      activity: [{ description: "Invented run" }],
      profiles: [base],
    })).includes("Invented run"), false);
    assert.equal(parseStoredAgentProfileList({ success: true, profiles: [{ ...base, activity: [] }] }), null);
    assert.equal(parseStoredAgentProfileList({ success: true, profiles: [{ ...base, runs: [] }] }), null);
    assert.equal(parseStoredAgentProfileList({ success: true, profiles: [{ ...base, experience_points: 10 }] }), null);
    assert.equal(parseStoredAgentProfileList({ success: true, profiles: [{ ...base, level: 2 }] }), null);
    assert.equal(parseStoredAgentProfileList({ success: true, profiles: [{ ...base, department: "Finance" }] }), null);
    assert.equal(parseAgentProfileList({ profiles: [] })?.length, 0);
    assert.equal(parseAgentProfileList({
      profiles: [base, { ...base, id: "22222222-2222-4222-8222-222222222222" }],
    }), null);
  });

  it("maps the six painted characters onto the seeded departments", () => {
    const sql = readFileSync(fileURLToPath(new URL(
      "../../../../../supabase/migrations/20261115064509_agent_profiles.sql",
      import.meta.url,
    )), "utf8");

    assert.equal(DEPARTMENTS.length, 6);
    for (const department of DEPARTMENTS) {
      assert.match(sql, new RegExp(`'${department.id}',\\s*'${department.agent.displayName}'`));
      assert.match(sql, new RegExp(`'${department.agent.visualId}'`));
    }
    assert.equal(dashboardRequestUrl("http://127.0.0.1:3000", "agent-profiles"), "http://127.0.0.1:3000/dashboard/agent-profiles");
    assert.equal(
      dashboardRequestUrl("http://127.0.0.1:3000", `agent-profiles/${PROFILE_ID}`),
      `http://127.0.0.1:3000/dashboard/agent-profiles/${PROFILE_ID}`,
    );
    assert.throws(() => dashboardRequestUrl("http://127.0.0.1:3000", "agent-profiles/not-a-uuid"));
  });

  it("treats a missing profile as empty and keeps a failed load from looking successful", async () => {
    assert.equal(isAgentProfileId(PROFILE_ID), true);
    assert.equal(isAgentProfileId("nova"), false);
    assert.deepEqual(agentProfileHistoryQuery("http://127.0.0.1/profiles?history_limit=8"), { history_limit: "8" });
    assert.deepEqual(agentProfileHistoryQuery("http://127.0.0.1/profiles?history_limit=21"), {});

    const missing = await loadAgentProfile(PROFILE_ID, async () => jsonResponse({ error: "Record not found" }, 404));
    assert.equal(missing, null);
    await assert.rejects(() => loadAgentProfiles(async () => jsonResponse({ error: "nope" }, 500)));
    await assert.rejects(() => loadAgentProfiles(async () => jsonResponse({
      profiles: [{ ...profile(), activity: [{ kind: "invented" }] }],
    })));

    const loaded = await loadAgentProfiles(async () => jsonResponse({ profiles: [profile()] }));
    assert.equal(loaded[0]?.agent_type, "research");
    assert.equal(loaded[0]?.recent_tasks.length, 0);
  });

  it("authorizes the owner and leaves the Phaser lifecycle in place", () => {
    const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
    const listRoute = read("../../app/api/dashboard/agent-profiles/route.ts");
    const detailRoute = read("../../app/api/dashboard/agent-profiles/[id]/route.ts");
    const live = read("../../components/ai-world/ai-world-live.tsx");
    const stage = read("../../components/ai-world/ai-world-stage.tsx");
    const mount = read("./mount-ai-world.ts");
    const panel = read("../../components/ai-world/ai-world-profile.tsx");

    assert.match(listRoute, /assertOwnerIdentity/);
    assert.match(listRoute, /actorId: owner\.id/);
    assert.match(detailRoute, /assertOwnerIdentity/);
    assert.match(detailRoute, /actorId: owner\.id/);
    assert.doesNotMatch(listRoute, /INTERNAL_API_SECRET|SUPABASE_SECRET_KEY|service_role/);
    assert.doesNotMatch(detailRoute, /INTERNAL_API_SECRET|SUPABASE_SECRET_KEY|service_role/);
    assert.equal(mount.match(/new Phaser\.Game/g)?.length, 1);
    assert.match(stage, /createGameLifecycle/);
    assert.match(stage, /resetCamera/);
    assert.match(live, /createAiWorldPoller/);
    assert.match(live, /<AiWorldStage/);
    assert.doesNotMatch(live, /startAiWorld|new Phaser\.Game|options=\{/);
    assert.match(panel, /specialization/);
    assert.match(panel, /\/agents\/tasks\//);
    assert.doesNotMatch(panel, /phaser|experience_points|setInterval/i);
  });
});
