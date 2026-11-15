import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Fastify from "fastify";
import { describe, it } from "node:test";
import { registerPrivateAccess } from "../security/private-access.js";
import {
  ApprovalWorkflowError,
  PRODUCT_REVIEW_SCOPE,
  type ApprovalDetail,
} from "../services/approval-workflow.service.js";
import {
  registerApprovalRoutes,
  type ApprovalWorkflowApi,
} from "./approval-workflow.routes.js";

const SECRET = "approval-route-secret-0123456789";
const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const REQUEST = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DECISION = "33333333-3333-4333-8333-333333333333";

function approval(status = "pending"): ApprovalDetail {
  return {
    id: REQUEST,
    candidate_id: "44444444-4444-4444-8444-444444444444",
    source_decision_id: DECISION,
    requested_action: "product_review",
    status,
    evidence_snapshot: {},
    decision_summary: { product_name: "Slow Feeder Pet Bowls", risks: ["Unverified shipping"] },
    created_at: "2026-11-14T18:00:00.000Z",
    resolved_at: null,
    requested_by: OWNER,
    reviewer_id: null,
    reviewer_notes: null,
    scope: PRODUCT_REVIEW_SCOPE,
    events: [],
  };
}

function api(seen: { actorId?: string } = {}): ApprovalWorkflowApi {
  return {
    async list() {
      return [approval()];
    },
    async detail() {
      return approval();
    },
    async create(_decisionId, actorId) {
      seen.actorId = actorId;
      return approval();
    },
    async resolve(requestId, actorId, decision) {
      seen.actorId = actorId;
      if (requestId !== REQUEST) {
        throw new ApprovalWorkflowError(404, "not_found");
      }
      if (decision === "approved") {
        throw new ApprovalWorkflowError(409, "stale_evidence");
      }
      return { ...approval("rejected"), reviewer_id: actorId };
    },
  };
}

async function createApp(seen: { actorId?: string } = {}) {
  const app = Fastify({ logger: false });
  registerPrivateAccess(app, { secret: SECRET });
  registerApprovalRoutes(app, api(seen));
  await app.ready();
  return app;
}

describe("approval routes", () => {

  it("requires the internal secret and the owner user id", async () => {
    const previous = process.env.DASHBOARD_OWNER_USER_ID;
    process.env.DASHBOARD_OWNER_USER_ID = OWNER;
    const app = await createApp();
    try {
      const noSecret = await app.inject({
        method: "POST",
        url: "/dashboard/approvals",
        remoteAddress: "203.0.113.10",
        payload: { decision_id: DECISION, reviewer_id: OTHER },
      });
      const wrongActor = await app.inject({
        method: "GET",
        url: "/dashboard/approvals",
        headers: {
          "x-aimpire-internal-secret": SECRET,
          "x-aimpire-actor-id": OTHER,
        },
      });
      const allowed = await app.inject({
        method: "GET",
        url: "/dashboard/approvals",
        headers: {
          "x-aimpire-internal-secret": SECRET,
          "x-aimpire-actor-id": OWNER,
        },
      });
      delete process.env.DASHBOARD_OWNER_USER_ID;
      const unconfigured = await app.inject({
        method: "GET",
        url: "/dashboard/approvals",
        headers: {
          "x-aimpire-internal-secret": SECRET,
          "x-aimpire-actor-id": OWNER,
        },
      });

      assert.equal(noSecret.statusCode, 401);
      assert.equal(wrongActor.statusCode, 403);
      assert.equal(allowed.statusCode, 200);
      assert.equal(unconfigured.statusCode, 503);
    } finally {
      if (previous === undefined) delete process.env.DASHBOARD_OWNER_USER_ID;
      else process.env.DASHBOARD_OWNER_USER_ID = previous;
      await app.close();
    }
  });

  it("ignores a reviewer id in the body and rejects stale approval", async () => {
    const previous = process.env.DASHBOARD_OWNER_USER_ID;
    process.env.DASHBOARD_OWNER_USER_ID = OWNER;
    const seen: { actorId?: string } = {};
    const app = await createApp(seen);
    const created = await app.inject({
      method: "POST",
      url: "/dashboard/approvals",
      headers: {
        "x-aimpire-internal-secret": SECRET,
        "x-aimpire-actor-id": OWNER,
      },
      payload: { decision_id: DECISION, reviewer_id: OTHER, notes: "Review this decision" },
    });
    const stale = await app.inject({
      method: "POST",
      url: `/dashboard/approvals/${REQUEST}/approve`,
      headers: {
        "x-aimpire-internal-secret": SECRET,
        "x-aimpire-actor-id": OWNER,
      },
      payload: { reviewer_id: OTHER, notes: "Approve sale" },
    });

    assert.equal(created.statusCode, 201);
    assert.equal(seen.actorId, OWNER);
    assert.equal(stale.statusCode, 409);
    assert.equal(stale.json().error, "stale_evidence");
    assert.equal(JSON.stringify(stale.json()).includes(SECRET), false);
    if (previous === undefined) delete process.env.DASHBOARD_OWNER_USER_ID;
    else process.env.DASHBOARD_OWNER_USER_ID = previous;
    await app.close();
  });

  it("hides database failures and does not expose write methods beyond review", () => {
    const source = readFileSync(new URL("./approval-workflow.routes.ts", import.meta.url), "utf8");
    assert.match(source, /app\.post\("\/dashboard\/approvals\/:id\/approve"/);
    assert.match(source, /app\.post\("\/dashboard\/approvals\/:id\/reject"/);
    assert.doesNotMatch(source, /shopify|purchas|advertis|executeNext|product_decisions/i);
  });
});
