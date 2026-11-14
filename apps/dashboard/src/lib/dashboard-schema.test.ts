import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DashboardUpstreamError } from "./errors";
import { parseDashboardPayloads } from "./dashboard-schema";

const overview = {
  success: true,
  overview: {
    product_candidates: { count: 1 },
    decision_score: { latest: 50, scale: 100 },
    approvals: {
      approved_count: 0,
      not_approved_count: 1,
      ready_for_review_count: 1,
    },
    agent_tasks: {
      total: 1,
      by_status: {
        pending: 1,
        in_progress: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
      },
    },
  },
  supabase_secret_key: "hidden",
};

describe("dashboard payload parsing", () => {
  it("drops undeclared fields and preserves the unapproved recommendation", () => {
    const parsed = parseDashboardPayloads({
      overview,
      candidates: {
        success: true,
        count: 0,
        candidates: [],
      },
      decisions: {
        success: true,
        count: 1,
        decisions: [{
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
          reasons: ["Need a person"],
          risks: [],
          next_actions: [],
          created_at: "2026-11-14T15:00:00.000Z",
          evidence_snapshot: { secret: "hidden" },
        }],
      },
      tasks: { success: true, count: 0, tasks: [] },
      activity: { success: true, count: 0, activity: [] },
      analyses: { success: true, count: 0, analyses: [] },
    });

    assert.equal(parsed.decisions[0]?.approved, false);
    assert.equal(parsed.decisions[0]?.recommendation, "ready_for_review");
    assert.equal(JSON.stringify(parsed).includes("hidden"), false);
    assert.equal(JSON.stringify(parsed).includes("evidence_snapshot"), false);
    assert.equal(parsed.overview.approvals.approved_count, 0);
    assert.equal(parsed.overview.approvals.ready_for_review_count, 1);
  });

  it("rejects a payload that claims success without the expected shape", () => {
    assert.throws(
      () => parseDashboardPayloads({
        overview: { success: true },
        candidates: { success: true, count: 0, candidates: [] },
        decisions: { success: true, count: 0, decisions: [] },
        tasks: { success: true, count: 0, tasks: [] },
        activity: { success: true, count: 0, activity: [] },
        analyses: { success: true, count: 0, analyses: [] },
      }),
      DashboardUpstreamError,
    );
  });
});
