import assert from "node:assert/strict";
import Fastify from "fastify";
import { describe, it } from "node:test";
import { registerPrivateAccess } from "../security/private-access.js";
import { AGENT_TYPES } from "../services/agent-operations.service.js";
import type { AiWorldSnapshot } from "../services/ai-world-state.service.js";
import { registerAiWorldStateRoutes } from "./ai-world-state.routes.js";

const SECRET = "ai-world-route-secret-0123456789";

function snapshot(): AiWorldSnapshot {
  return {
    server_time: "2026-11-15T15:00:00.000Z",
    pending_product_reviews: 1,
    departments: AGENT_TYPES.map((departmentId) => ({
      department_id: departmentId,
      queued: departmentId === "research" ? 2 : 0,
      running: departmentId === "support" ? 1 : 0,
      completed: 0,
      failed: 0,
      current_task: departmentId === "support"
        ? { id: "44444444-4444-4444-8444-444444444444", title: "Answer the open ticket" }
        : null,
      latest_task: null,
    })),
  };
}

async function createApp() {
  const app = Fastify({ logger: false });
  registerPrivateAccess(app, { secret: SECRET });
  registerAiWorldStateRoutes(app, { snapshot: async () => snapshot() });
  await app.ready();
  return app;
}

describe("AI World state route", () => {
  it("requires the internal secret and returns the read-only snapshot", async () => {
    const app = await createApp();
    const denied = await app.inject({
      method: "GET",
      url: "/dashboard/ai-world/state",
      remoteAddress: "10.1.1.1",
    });
    const allowed = await app.inject({
      method: "GET",
      url: "/dashboard/ai-world/state",
      remoteAddress: "10.1.1.1",
      headers: { "x-aimpire-internal-secret": SECRET },
    });
    const write = await app.inject({
      method: "POST",
      url: "/dashboard/ai-world/state",
      remoteAddress: "127.0.0.1",
      headers: { "x-aimpire-internal-secret": SECRET },
      payload: { execute: true },
    });
    const body = allowed.json();

    assert.equal(denied.statusCode, 401);
    assert.equal(allowed.statusCode, 200);
    assert.equal(body.snapshot.departments[0].queued, 2);
    assert.equal(body.snapshot.departments[5].running, 1);
    assert.equal(body.snapshot.pending_product_reviews, 1);
    assert.equal(JSON.stringify(body).includes(SECRET), false);
    assert.equal(write.statusCode, 404);
    await app.close();
  });
});
