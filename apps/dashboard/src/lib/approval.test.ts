import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { approvalKpi, approvalText, isDashboardOwner, reviewForDecision } from "./approval";
import { formatScore } from "./presentation";

describe("single-owner authorization", () => {
  it("accepts only the configured owner email", () => {
    assert.equal(isDashboardOwner("Owner@Example.com", "owner@example.com"), true);
    assert.equal(isDashboardOwner("other@example.com", "owner@example.com"), false);
    assert.equal(isDashboardOwner("owner@example.com", ""), false);
    assert.equal(isDashboardOwner("owner@example.com", "not-an-email"), false);
    assert.equal(isDashboardOwner(null, "owner@example.com"), false);
  });
});

describe("approval presentation", () => {
  it("never displays ready_for_review as approved", () => {
    assert.equal(approvalText(false, "Not approved"), "Not approved");
    assert.equal(approvalText(false, "Approved"), "Not approved");
    assert.equal(approvalText(false, "Ready for review"), "Ready for review");
    assert.equal(approvalText(true, "Approved"), "Approved");
    assert.equal(
      approvalKpi({ approved_count: 0, ready_for_review_count: 2 }).value,
      "0 approved",
    );
    assert.match(
      approvalKpi({ approved_count: 0, ready_for_review_count: 2 }).detail,
      /not counted as approved/,
    );
    assert.equal(formatScore(50), "50/100");
  });

  it("uses the approved review instead of inviting another request", () => {
    const reviews = [
      { id: "rejected", status: "rejected", source_decision_id: "decision", created_at: "2026-11-14T00:00:00Z" },
      { id: "approved", status: "approved", source_decision_id: "decision", created_at: "2026-11-15T00:00:00Z" },
    ];
    assert.equal(reviewForDecision(reviews, "decision")?.id, "approved");
    assert.equal(reviewForDecision(reviews, "missing"), null);
  });
});
