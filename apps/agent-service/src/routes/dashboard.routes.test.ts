import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Fastify from "fastify";
import { describe, it } from "node:test";
import { registerDashboardRoutes, type DashboardReadApi } from "./dashboard.routes.js";
import { registerPrivateAccess } from "../security/private-access.js";

const SECRET = "dashboard-route-secret";

function service(overrides: Partial<DashboardReadApi> = {}): DashboardReadApi {
  return {
    async overview() {
      return {
        product_candidates: { count: 0 },
        decision_score: { latest: null, scale: 100 },
        approvals: {
          approved_count: 0,
          not_approved_count: 0,
          ready_for_review_count: 0,
        },
        agent_tasks: {
          total: 0,
          by_status: {
            pending: 0,
            in_progress: 0,
            completed: 0,
            failed: 0,
            cancelled: 0,
          },
        },
      };
    },
    async productCandidates() {
      return [];
    },
    async productDecisions() {
      return [{
        id: "decision-1",
        candidate_id: "candidate-1",
        product_name: "Slow Feeder Pet Bowls",
        target_market: ["CA", "US"],
        candidate_status: "discovered",
        recommendation: "ready_for_review",
        recommendation_label: "Ready for review",
        decision_status: "proposed",
        approval_status: "not_approved",
        approval_label: "Not approved",
        approved: false,
        decision_score: 50,
        reasons: [],
        risks: [],
        next_actions: [],
        created_at: "2026-11-14T15:00:00.000Z",
      }];
    },
    async agentTasks() {
      return [];
    },
    async activity() {
      return [];
    },
    async profitabilityAnalyses() {
      return [];
    },
    ...overrides,
  };
}

async function createApp(api = service()) {
  const app = Fastify({ logger: false });
  registerPrivateAccess(app, { secret: SECRET });
  registerDashboardRoutes(app, api);
  await app.ready();
  return app;
}

describe("dashboard routes", () => {
  it("requires the internal secret before reading decisions", async () => {
    const app = await createApp();
    const denied = await app.inject({
      method: "GET",
      url: "/dashboard/product-decisions",
      remoteAddress: "127.0.0.1",
    });
    const allowed = await app.inject({
      method: "GET",
      url: "/dashboard/product-decisions",
      remoteAddress: "127.0.0.1",
      headers: { "x-aimpire-internal-secret": SECRET },
    });
    const body = allowed.json();

    assert.equal(denied.statusCode, 401);
    assert.equal(allowed.statusCode, 200);
    assert.equal(body.decisions[0].approved, false);
    assert.equal(body.decisions[0].approval_label, "Not approved");
    assert.equal(body.decisions[0].recommendation, "ready_for_review");
    assert.equal(JSON.stringify(body).includes(SECRET), false);
    await app.close();
  });

  it("does not expose write methods or upstream error details", async () => {
    const app = await createApp(service({
      async activity() {
        throw new Error("database password=sb_secret_should_not_leak");
      },
    }));
    const posted = await app.inject({
      method: "POST",
      url: "/dashboard/activity",
      remoteAddress: "127.0.0.1",
      headers: { "x-aimpire-internal-secret": SECRET },
    });
    const failed = await app.inject({
      method: "GET",
      url: "/dashboard/activity",
      remoteAddress: "127.0.0.1",
      headers: { "x-aimpire-internal-secret": SECRET },
    });
    const serialized = JSON.stringify(failed.json());

    assert.equal(posted.statusCode, 404);
    assert.equal(failed.statusCode, 500);
    assert.equal(failed.json().error, "Failed to load dashboard data");
    assert.equal(serialized.includes("sb_secret_should_not_leak"), false);
    assert.equal(serialized.includes("password"), false);
    await app.close();
  });

  it("registers only GET handlers for dashboard data", () => {
    const source = readFileSync(new URL("./dashboard.routes.ts", import.meta.url), "utf8");

    assert.match(source, /app\.get\("\/dashboard\/product-candidates"/);
    assert.match(source, /app\.get\("\/dashboard\/product-decisions"/);
    assert.match(source, /app\.get\("\/dashboard\/agent-tasks"/);
    assert.match(source, /app\.get\("\/dashboard\/activity"/);
    assert.match(source, /app\.get\("\/dashboard\/profitability-analyses"/);
    assert.doesNotMatch(source, /app\.(post|put|patch|delete)\(/);
  });
});
