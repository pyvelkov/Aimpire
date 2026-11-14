import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Fastify from "fastify";
import { describe, it } from "node:test";
import { registerPrivateAccess } from "../security/private-access.js";
import { TaskNotFoundError } from "../services/agent-operations.service.js";
import {
  registerAgentOperationsRoutes,
  type AgentOperationsApi,
} from "./agent-operations.routes.js";

const SECRET = "agent-route-secret-0123456789";
const TASK_ID = "11111111-1111-4111-8111-111111111111";

function api(): AgentOperationsApi {
  return {
    async overview() {
      return {
        total: 12,
        pending: 9,
        running: 0,
        completed: 2,
        failed: 1,
        cancelled: 0,
        departments: [],
      };
    },
    async tasks(query) {
      assert.equal(query.status, "pending");
      assert.equal(query.page, 2);
      assert.equal(query.pageSize, 10);
      return {
        match_count: 9,
        tasks: [{
          id: TASK_ID,
          title: "Identify trending products",
          description: "Research",
          agent_type: "research",
          status: "pending",
          status_label: "Queued",
          priority: 1,
          created_at: "2026-11-14T10:00:00.000Z",
          started_at: null,
          completed_at: null,
          last_activity_at: "2026-11-14T10:00:00.000Z",
          error_message: null,
        }],
      };
    },
    async taskDetail(id) {
      if (id !== TASK_ID) {
        throw new TaskNotFoundError();
      }
      return {
        id,
        title: "Identify trending products",
        description: "Research",
        agent_type: "research",
        status: "pending",
        status_label: "Queued",
        priority: 1,
        created_at: "2026-11-14T10:00:00.000Z",
        started_at: null,
        completed_at: null,
        last_activity_at: "2026-11-14T10:00:00.000Z",
        error_message: null,
        input: { goal: "find products" },
        result: null,
        runs: [],
        activity: [],
      };
    },
  };
}

async function createApp() {
  const app = Fastify({ logger: false });
  registerPrivateAccess(app, { secret: SECRET });
  registerAgentOperationsRoutes(app, api());
  await app.ready();
  return app;
}

describe("agent operations routes", () => {
  it("requires the internal secret and preserves queued status", async () => {
    const app = await createApp();
    const denied = await app.inject({
      method: "GET",
      url: "/dashboard/agents?status=pending&page=2",
      remoteAddress: "127.0.0.1",
    });
    const allowed = await app.inject({
      method: "GET",
      url: "/dashboard/agents?status=pending&page=2",
      remoteAddress: "127.0.0.1",
      headers: { "x-aimpire-internal-secret": SECRET },
    });
    const body = allowed.json();

    assert.equal(denied.statusCode, 401);
    assert.equal(allowed.statusCode, 200);
    assert.equal(body.overview.pending, 9);
    assert.equal(body.overview.running, 0);
    assert.equal(body.tasks[0].status_label, "Queued");
    assert.equal(JSON.stringify(body).includes(SECRET), false);
    await app.close();
  });

  it("rejects invalid filters, unknown tasks, and writes", async () => {
    const app = await createApp();
    const headers = { "x-aimpire-internal-secret": SECRET };
    const invalid = await app.inject({
      method: "GET",
      url: "/dashboard/agents?status=running",
      remoteAddress: "127.0.0.1",
      headers,
    });
    const missing = await app.inject({
      method: "GET",
      url: "/dashboard/agents/tasks/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      remoteAddress: "127.0.0.1",
      headers,
    });
    const detail = await app.inject({
      method: "GET",
      url: `/dashboard/agents/tasks/${TASK_ID}`,
      remoteAddress: "127.0.0.1",
      headers,
    });
    const posted = await app.inject({
      method: "POST",
      url: `/dashboard/agents/tasks/${TASK_ID}`,
      remoteAddress: "127.0.0.1",
      headers,
    });

    assert.equal(invalid.statusCode, 400);
    assert.equal(missing.statusCode, 404);
    assert.equal(detail.statusCode, 200);
    assert.deepEqual(detail.json().task.runs, []);
    assert.deepEqual(detail.json().task.activity, []);
    assert.equal(posted.statusCode, 404);
    assert.equal(JSON.stringify(detail.json()).includes(SECRET), false);
    await app.close();
  });

  it("registers only read endpoints", () => {
    const source = readFileSync(new URL("./agent-operations.routes.ts", import.meta.url), "utf8");
    assert.match(source, /app\.get\("\/dashboard\/agents"/);
    assert.match(source, /app\.get\("\/dashboard\/agents\/tasks\/:id"/);
    assert.doesNotMatch(source, /app\.(post|put|patch|delete)\(/);
  });
});
