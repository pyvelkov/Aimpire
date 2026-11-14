import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  DashboardReader,
  Filter,
  ListRequest,
  Row,
} from "./dashboard-read.service.js";
import {
  ProductManagementService,
  ProductNotFoundError,
  marketShippingLabel,
  quoteEvidence,
} from "./product-management.service.js";

function memoryReader(tables: Record<string, Row[]>): DashboardReader {
  return {
    async list(input: ListRequest) {
      let rows = [...(tables[input.table] ?? [])];
      for (const filter of input.filters ?? []) {
        rows = rows.filter((row) => String(row[filter.column]) === filter.value);
      }
      if (input.in) {
        const column = input.in.column;
        const allowed = new Set(input.in.values);
        rows = rows.filter((row) => allowed.has(String(row[column])));
      }
      if (input.orderBy) {
        const column = input.orderBy;
        rows.sort((left, right) => {
          const comparison = String(left[column] ?? "").localeCompare(String(right[column] ?? ""));
          return input.ascending ? comparison : -comparison;
        });
      }
      return rows.slice(0, input.limit);
    },
    async count(table: string, filters?: Filter[]) {
      let rows = [...(tables[table] ?? [])];
      for (const filter of filters ?? []) {
        rows = rows.filter((row) => String(row[filter.column]) === filter.value);
      }
      return rows.length;
    },
  };
}

const candidateId = "73e6e4bd-41d8-497f-9c65-5a5d249ce329";

describe("product management evidence", () => {
  it("does not describe unverified shipping as confirmed", () => {
    const unverified = quoteEvidence("unverified");
    assert.equal(unverified.confirmed, false);
    assert.equal(unverified.evidence_label, "Unverified — not confirmed");
    assert.notEqual(unverified.evidence_label, "Confirmed");
    assert.equal(marketShippingLabel("unknown"), "Unknown — not verified");
    assert.equal(quoteEvidence("verified").confirmed, true);
  });

  it("keeps ready_for_review separate from approval and lists missing evidence", async () => {
    const service = new ProductManagementService(memoryReader({
      product_candidates: [{
        id: candidateId,
        name: "Slow Feeder Pet Bowls",
        description: "A puzzle bowl",
        category: "Pet supplies",
        status: "discovered",
        target_market: ["CA", "US"],
        source_url: "https://example.com/research",
        supplier_name: null,
        supplier_url: null,
        evaluation_data: { recommendation: "investigate_further" },
        created_at: "2026-11-11T05:00:00.000Z",
        updated_at: "2026-11-11T05:53:05.000Z",
      }],
      supplier_discoveries: [],
      supplier_discovery_runs: [],
      supplier_product_listings: [{
        id: "listing-1",
        candidate_id: candidateId,
        sku: "BOWL-1",
        product_title: "Puzzle bowl",
        product_url: "https://example.com/bowl",
        material: null,
        reported_price: 2,
        reported_currency: "USD",
        verification_status: "unverified",
        price_evidence_text: "Shown as $2",
        missing_evidence: ["weight"],
        created_at: "2026-11-14T12:00:00.000Z",
      }],
      supplier_listing_research_runs: [],
      supplier_listing_verifications: [{
        id: "verification-1",
        listing_id: "listing-1",
        review_status: "manually_reviewed",
        sku_match_confirmed: true,
        displayed_price: 2,
        currency: "USD",
        variant_description: "Blue",
        material_description: null,
        listed_weight_grams: null,
        shipping_ca_status: "unknown",
        shipping_us_status: "unknown",
        food_contact_documentation_status: "unknown",
        evidence_source: "manual",
        evidence_notes: null,
        checked_at: null,
        updated_at: "2026-11-14T13:00:00.000Z",
      }],
      supplier_shipping_quotes: [
        {
          id: "quote-ca",
          verification_id: "verification-1",
          market: "CA",
          verification_status: "unverified",
          shipping_method: "CJPacket Ordinary",
          shipping_cost: 8.61,
          currency: "USD",
          destination_region: "Ontario",
          estimated_delivery_min_days: 8,
          estimated_delivery_max_days: 15,
          evidence_notes: "Screenshot",
          created_at: "2026-11-14T14:00:00.000Z",
        },
        {
          id: "quote-us",
          verification_id: "verification-1",
          market: "US",
          verification_status: "unverified",
          shipping_method: "Ordinary US",
          shipping_cost: 10.26,
          currency: "USD",
          destination_region: null,
          estimated_delivery_min_days: 7,
          estimated_delivery_max_days: 12,
          evidence_notes: null,
          created_at: "2026-11-14T14:01:00.000Z",
        },
      ],
      product_profitability_analyses: [],
      product_decisions: [{
        id: "decision-1",
        candidate_id: candidateId,
        listing_id: "listing-1",
        recommendation: "ready_for_review",
        decision_status: "proposed",
        approval_status: "not_approved",
        decision_score: 80,
        reasons: ["Evidence is complete enough to inspect"],
        risks: ["Shipping is unverified"],
        next_actions: ["Ask a person to review"],
        engine_version: "1.0",
        created_at: "2026-11-14T15:00:00.000Z",
      }],
    }));

    const detail = await service.productDetail(candidateId);
    const quote = detail.listings[0]?.shipping_quotes.find((item) => item.market === "CA");

    assert.equal(detail.discoveries.length, 0);
    assert.equal(detail.decision?.recommendation_label, "Ready for review");
    assert.equal(detail.decision?.approval_label, "Not approved");
    assert.equal(detail.decision?.approved, false);
    assert.equal(quote?.confirmed, false);
    assert.equal(quote?.evidence_label, "Unverified — not confirmed");
    assert.equal(detail.listings[0]?.verification?.shipping_ca_label, "Unknown — not verified");
    assert.ok(detail.gaps.includes("No supplier discoveries"));
    assert.ok(detail.gaps.includes("Canada shipping status for BOWL-1 is unknown, not verified"));
    assert.ok(detail.gaps.includes("Canada shipping estimate for BOWL-1 is unverified, not confirmed"));
    assert.ok(detail.gaps.includes("No saved Canada profitability analysis for BOWL-1"));
    assert.equal(detail.gaps.some((gap) => gap === "Confirmed"), false);
    assert.equal(JSON.stringify(detail).includes("api_key"), false);
  });

  it("states when a product has no supplier, shipping, or decision evidence", async () => {
    const emptyId = "1558a4bb-55d8-40a4-8942-abe1160319ac";
    const service = new ProductManagementService(memoryReader({
      product_candidates: [{
        id: emptyId,
        name: "Memory Foam Lumbar Support Cushions",
        description: null,
        category: "Ergonomic cushions",
        status: "discovered",
        target_market: ["CA", "US"],
        created_at: "2026-11-11T05:00:00.000Z",
        updated_at: "2026-11-11T05:52:12.000Z",
      }],
    }));

    const [product] = await service.products();
    const detail = await service.productDetail(emptyId);

    assert.equal(product?.latest_decision, null);
    assert.equal(detail.listings.length, 0);
    assert.equal(detail.decision, null);
    assert.deepEqual(detail.gaps, [
      "No supplier discoveries",
      "No extracted supplier listings",
      "No Canada shipping estimate",
      "No United States shipping estimate",
      "No saved Canada profitability analysis",
      "No saved United States profitability analysis",
      "No product decision has been saved",
    ]);
  });

  it("returns not found instead of an empty product", async () => {
    const service = new ProductManagementService(memoryReader({}));
    await assert.rejects(
      () => service.productDetail("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
      ProductNotFoundError,
    );
  });
});
