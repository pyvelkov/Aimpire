import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { displayEvidenceLabel } from "./shipping-evidence";
import { parseProductDetail, parseProductList } from "./product-schema";

const productId = "73e6e4bd-41d8-497f-9c65-5a5d249ce329";

describe("product management presentation", () => {
  it("does not present an unverified estimate as confirmed", () => {
    assert.equal(
      displayEvidenceLabel("unverified", "Unverified — not confirmed"),
      "Unverified — not confirmed",
    );
    assert.equal(displayEvidenceLabel("unverified", "Confirmed"), "Unverified — not confirmed");
    assert.equal(displayEvidenceLabel("verified", "Verified"), "Verified");
  });

  it("keeps a ready_for_review decision unapproved", () => {
    const parsed = parseProductList({
      success: true,
      count: 1,
      products: [{
        id: productId,
        name: "Slow Feeder Pet Bowls",
        category: "Pet supplies",
        status: "discovered",
        target_market: ["CA", "US"],
        created_at: "2026-11-11T05:00:00.000Z",
        updated_at: "2026-11-11T05:53:05.000Z",
        latest_decision: {
          id: "decision-1",
          recommendation: "ready_for_review",
          recommendation_label: "Ready for review",
          decision_status: "proposed",
          approval_status: "not_approved",
          approval_label: "Not approved",
          approved: false,
          decision_score: 50,
          created_at: "2026-11-14T15:00:00.000Z",
        },
        supabase_secret_key: "hidden",
      }],
    });

    assert.equal(parsed[0]?.latest_decision?.approved, false);
    assert.equal(parsed[0]?.latest_decision?.approval_label, "Not approved");
    assert.equal(JSON.stringify(parsed).includes("hidden"), false);
  });

  it("preserves explicit missing evidence", () => {
    const detail = parseProductDetail({
      success: true,
      product: {
        product: {
          id: productId,
          name: "Memory Foam Lumbar Support Cushions",
          description: null,
          category: "Ergonomic cushions",
          status: "discovered",
          target_market: ["CA", "US"],
          source_url: null,
          supplier_name: null,
          supplier_url: null,
          created_at: "2026-11-11T05:00:00.000Z",
          updated_at: null,
          preliminary_recommendation: null,
        },
        discoveries: [],
        discovery_runs: [],
        listings: [],
        listing_research_runs: [],
        decision: null,
        gaps: [
          "No supplier discoveries",
          "No Canada shipping estimate",
        ],
      },
    });

    assert.equal(detail.decision, null);
    assert.deepEqual(detail.gaps, [
      "No supplier discoveries",
      "No Canada shipping estimate",
    ]);
  });
});
