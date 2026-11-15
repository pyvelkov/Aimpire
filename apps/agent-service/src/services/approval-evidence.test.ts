import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { currentSkuEvidence } from "./product-decision.fixture.js";
import {
  DEFAULT_DECISION_THRESHOLDS,
  evaluateProductDecision,
  evidenceDriftReasons,
} from "./product-decision.engine.js";

describe("approval evidence drift", () => {
  it("reuses the decision engine and reports a changed shipping quote without a new calculation", () => {
    const evidence = currentSkuEvidence();
    const decision = evaluateProductDecision(evidence, DEFAULT_DECISION_THRESHOLDS);
    assert.deepEqual(evidenceDriftReasons(decision.evidence_snapshot, evidence), []);

    evidence.quotes[0].shipping_cost = Number(evidence.quotes[0].shipping_cost) + 5;
    const reasons = evidenceDriftReasons(decision.evidence_snapshot, evidence);
    assert.equal(reasons.length > 0, true);
    assert.equal(reasons.some((reason) => reason.toLowerCase().includes("shipping")), true);
  });
});
