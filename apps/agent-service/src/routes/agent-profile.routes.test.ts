import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Fastify from "fastify";
import { describe, it } from "node:test";
import { registerPrivateAccess } from "../security/private-access.js";
import { ProfileNotFoundError, type AgentProfileView } from "../services/agent-profile.service.js";
import { progressionFromCompletedCount } from "../services/agent-progression.js";
import { registerAgentProfileRoutes, type AgentProfileApi } from "./agent-profile.routes.js";

const SECRET = "agent-profile-route-secret-0123456789";
const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const PROFILE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function profile(): AgentProfileView {
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
    progression: progressionFromCompletedCount(0),
    current_task: null,
    recent_tasks: [],
    completed_tasks: [],
    failed_tasks: [],
  };
}

function api(seen: { limits: number[]; id?: string } = { limits: [] }): AgentProfileApi {
  return {
    async list(limit) {
      seen.limits.push(limit);
      return [profile()];
    },
    async get(id, limit) {
      seen.id = id;
      seen.limits.push(limit);
      if (id !== PROFILE_ID) {
        throw new ProfileNotFoundError();
      }
      return profile();
    },
  };
}

async function createApp(seen: { limits: number[]; id?: string } = { limits: [] }) {
  const app = Fastify({ logger: false });
  registerPrivateAccess(app, { secret: SECRET });
  registerAgentProfileRoutes(app, api(seen));
  await app.ready();
  return app;
}

function ownerHeaders(actor = OWNER): Record<string, string> {
  return {
    "x-aimpire-internal-secret": SECRET,
    "x-aimpire-actor-id": actor,
  };
}

describe("agent profile routes", () => {
  it("requires the internal secret and the owner user id", async () => {
    const previous = process.env.DASHBOARD_OWNER_USER_ID;
    process.env.DASHBOARD_OWNER_USER_ID = OWNER;
    const app = await createApp();

    try {
      const noSecret = await app.inject({
        method: "GET",
        url: "/dashboard/agent-profiles",
        remoteAddress: "203.0.113.10",
      });
      const wrongActor = await app.inject({
        method: "GET",
        url: "/dashboard/agent-profiles",
        remoteAddress: "203.0.113.10",
        headers: ownerHeaders(OTHER),
      });
      const allowed = await app.inject({
        method: "GET",
        url: "/dashboard/agent-profiles",
        remoteAddress: "203.0.113.10",
        headers: ownerHeaders(),
      });
      delete process.env.DASHBOARD_OWNER_USER_ID;
      const unconfigured = await app.inject({
        method: "GET",
        url: `/dashboard/agent-profiles/${PROFILE_ID}`,
        remoteAddress: "203.0.113.10",
        headers: ownerHeaders(),
      });

      assert.equal(noSecret.statusCode, 401);
      assert.equal(wrongActor.statusCode, 403);
      assert.equal(allowed.statusCode, 200);
      assert.equal(allowed.json().profiles[0].display_name, "Nova");
      assert.equal(JSON.stringify(allowed.json()).includes(SECRET), false);
      assert.equal(unconfigured.statusCode, 503);
    } finally {
      if (previous === undefined) delete process.env.DASHBOARD_OWNER_USER_ID;
      else process.env.DASHBOARD_OWNER_USER_ID = previous;
      await app.close();
    }
  });

  it("returns one saved profile and a bounded history limit", async () => {
    const previous = process.env.DASHBOARD_OWNER_USER_ID;
    process.env.DASHBOARD_OWNER_USER_ID = OWNER;
    const seen: { limits: number[]; id?: string } = { limits: [] };
    const app = await createApp(seen);

    try {
      const listed = await app.inject({
        method: "GET",
        url: "/dashboard/agent-profiles?history_limit=2",
        headers: ownerHeaders(),
      });
      const found = await app.inject({
        method: "GET",
        url: `/dashboard/agent-profiles/${PROFILE_ID}`,
        headers: ownerHeaders(),
      });
      const missing = await app.inject({
        method: "GET",
        url: "/dashboard/agent-profiles/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        headers: ownerHeaders(),
      });
      const invalid = await app.inject({
        method: "GET",
        url: "/dashboard/agent-profiles/not-a-profile",
        headers: ownerHeaders(),
      });
      const tooLarge = await app.inject({
        method: "GET",
        url: "/dashboard/agent-profiles?history_limit=21",
        headers: ownerHeaders(),
      });
      const write = await app.inject({
        method: "POST",
        url: "/dashboard/agent-profiles",
        headers: ownerHeaders(),
        payload: { display_name: "Nova" },
      });

      assert.equal(listed.statusCode, 200);
      assert.deepEqual(seen.limits, [2, 8, 8]);
      assert.equal(found.statusCode, 200);
      assert.equal(found.json().profile.id, PROFILE_ID);
      assert.equal(seen.id, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
      assert.equal(missing.statusCode, 404);
      assert.equal(invalid.statusCode, 400);
      assert.equal(tooLarge.statusCode, 400);
      assert.equal(write.statusCode, 404);
      assert.equal(JSON.stringify(found.json()).includes("agent_runs"), false);
    } finally {
      if (previous === undefined) delete process.env.DASHBOARD_OWNER_USER_ID;
      else process.env.DASHBOARD_OWNER_USER_ID = previous;
      await app.close();
    }
  });

  it("stays read-only", () => {
    const source = readFileSync(new URL("./agent-profile.routes.ts", import.meta.url), "utf8");
    assert.match(source, /resolveReviewer/);
    assert.doesNotMatch(source, /app\.post|agent_runs|activity_logs|\.insert\(/);
  });
});
