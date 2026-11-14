import "dotenv/config";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Fastify from "fastify";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  currentSkuEvidence,
  evidenceSnapshot,
} from "./product-decision.fixture.js";
import {
  evaluateProductDecision,
  type DecisionEvidence,
  type MarketCode,
  type ProductDecision,
} from "./product-decision.engine.js";
import {
  ProductDecisionDataError,
  ProductDecisionService,
  registerProductDecisionRoute,
  type ProductDecisionDb,
} from "./product-decision.service.js";

const validatedLimitations = [
  "Selling price is validated",
  "Acquisition cost is validated",
  "Taxes and duties are included",
];

describe("decision safeguards", () => {
  it("never recommends ready_for_review when supplier verification is missing", () => {
    const cases: Array<[string, (evidence: DecisionEvidence) => void]> = [
      ["no verification row", (evidence) => {
        evidence.verifications = [];
      }],
      ["null displayed price", (evidence) => {
        evidence.verifications[0].displayed_price = null;
      }],
      ["sku match not confirmed", (evidence) => {
        evidence.verifications[0].sku_match_confirmed = false;
      }],
      ["review is not manual", (evidence) => {
        evidence.verifications[0].review_status = "pending";
      }],
    ];

    for (const [name, apply] of cases) {
      const evidence = readyEvidence();
      apply(evidence);
      const decision = evaluateProductDecision(evidence);

      assertNotReady(decision, name);
      assert.notEqual(
        decision.evidence_snapshot.verification_state,
        "complete",
        name,
      );
    }

    const priced = readyEvidence();
    priced.verifications[0].displayed_price = null;
    const pricedDecision = evaluateProductDecision(priced);
    assert.equal(
      pricedDecision.evidence_snapshot.markets.US.used_for_decision,
      false,
    );
    assert.equal(
      pricedDecision.evidence_snapshot.markets.US.contribution_profit_after_ads,
      null,
    );

    const missing = evaluateProductDecision({
      ...readyEvidence(),
      verifications: [],
    });
    assert.match(missing.reasons.join(" "), /product verification is missing/i);
  });

  it("never recommends ready_for_review when shipping evidence is missing or unverified", () => {
    const cases: Array<[string, (evidence: DecisionEvidence) => void]> = [
      ["no shipping quotes", (evidence) => {
        evidence.quotes = [];
      }],
      ["quote status is unverified", (evidence) => {
        evidence.quotes[0].verification_status = "unverified";
        alignAnalyses(evidence);
      }],
      ["market shipping status is unknown", (evidence) => {
        evidence.verifications[0].shipping_ca_status = "unknown";
      }],
      ["two quotes match one market", (evidence) => {
        evidence.quotes.push({
          ...evidence.quotes[0],
          id: "second-ca-quote",
        });
      }],
    ];

    for (const [name, apply] of cases) {
      const evidence = readyEvidence();
      apply(evidence);
      const decision = evaluateProductDecision(evidence);

      assertNotReady(decision, name);
      assert.match(
        decision.reasons.join(" "),
        /shipping evidence is/i,
        name,
      );
    }
  });

  it("recommends hold when current CA and US contribution after advertising are both negative", () => {
    const evidence = readyEvidence();
    setContributions(evidence, { CA: -2.5, US: -0.15 });

    const decision = evaluateProductDecision(evidence);

    assert.equal(decision.recommendation, "hold");
    assert.equal(
      decision.evidence_snapshot.recommendation_rule,
      "negative_contribution_after_ads_both_markets",
    );
    assert.equal(decision.approval_status, "not_approved");
    assert.equal(decision.decision_status, "proposed");
    assert.equal(
      decision.evidence_snapshot.markets.CA.contribution_profit_after_ads,
      -2.5,
    );
    assert.equal(
      decision.evidence_snapshot.markets.US.contribution_profit_after_ads,
      -0.15,
    );
    assert.match(
      decision.reasons.join(" "),
      /negative contribution after advertising in CA and US/i,
    );
  });

  it("detects stale and conflicting profitability analyses and blocks review", () => {
    const stale = readyEvidence();
    setContributions(stale, { CA: 20, US: 20 });
    stale.verifications[0].displayed_price = 4;

    const staleDecision = evaluateProductDecision(stale);

    assertNotReady(staleDecision, "stale price");
    assert.equal(
      staleDecision.evidence_snapshot.markets.CA.analysis_state,
      "stale",
    );
    assert.match(
      staleDecision.evidence_snapshot.markets.CA.staleness_reasons.join(" "),
      /product_cost/i,
    );
    assert.equal(
      staleDecision.evidence_snapshot.markets.CA.used_for_decision,
      false,
    );

    const conflicting = readyEvidence();
    const us = conflicting.analyses.find((analysis) => analysis.market === "US");
    assert.ok(us);
    conflicting.analyses.push({
      ...structuredClone(us),
      id: "later-us-analysis",
      created_at: "2026-11-14T16:00:00.000Z",
      calculation: {
        ...(us.calculation as Record<string, unknown>),
        contribution_profit_after_ads: 80,
      },
    });

    const conflictingDecision = evaluateProductDecision(conflicting);

    assertNotReady(conflictingDecision, "conflicting analyses");
    assert.equal(
      conflictingDecision.evidence_snapshot.markets.US.analysis_state,
      "ambiguous",
    );
    assert.equal(
      conflictingDecision.evidence_snapshot.markets.US.analysis_id,
      null,
    );
    assert.match(
      conflictingDecision.evidence_snapshot.markets.US.staleness_reasons.join(" "),
      /disagree/i,
    );
    assert.doesNotMatch(
      conflictingDecision.reasons.join(" "),
      /contribution_profit_after_ads 80/,
    );
  });

  it("does not approve a product because profitability is positive", async () => {
    const preliminary = evaluateProductDecision(currentSkuEvidence());
    assert.equal(preliminary.recommendation, "investigate_further");
    assert.equal(preliminary.approval_status, "not_approved");
    assert.match(
      preliminary.reasons.join(" "),
      /positive preliminary unit economics/i,
    );

    const ready = evaluateProductDecision(readyEvidence());
    assert.equal(ready.recommendation, "ready_for_review");
    assert.equal(ready.approval_status, "not_approved");
    assert.equal(ready.decision_status, "proposed");

    const evidence = readyEvidence();
    const before = structuredClone(supplierSnapshot(evidence));
    const db = createFakeDb(evidence);
    const saved = await new ProductDecisionService(db).decide(
      evidence.listing.sku,
    );

    assert.equal(saved.recommendation, "ready_for_review");
    assert.equal(saved.approval_status, "not_approved");
    assert.equal(saved.decision_status, "proposed");
    assert.deepEqual(supplierSnapshot(evidence), before);
    assert.deepEqual(db.writes.map((write) => write.payload.approval_status), [
      "not_approved",
    ]);
  });

  it("keeps approval unchanged and leaves supplier evidence untouched across repeats", async () => {
    const evidence = currentSkuEvidence();
    const before = structuredClone(supplierSnapshot(evidence));
    const db = createFakeDb(evidence);
    const service = new ProductDecisionService(db);

    const results = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      results.push(await service.decide(evidence.listing.sku));
    }

    assert.deepEqual(
      results.map((result) => result.approval_status),
      ["not_approved", "not_approved", "not_approved"],
    );
    assert.deepEqual(
      results.map((result) => result.decision_status),
      ["proposed", "proposed", "proposed"],
    );
    assert.deepEqual(supplierSnapshot(evidence), before);
    assert.deepEqual(
      db.writes.map((write) => `${write.operation}:${write.table}`),
      [
        "insert:product_decisions",
        "insert:product_decisions",
        "insert:product_decisions",
      ],
    );
    assert.deepEqual(db.reads.filter((table) => table === "product_decisions"), []);
  });

  it("propagates database errors instead of returning a recommendation", async () => {
    const tables = [
      "supplier_product_listings",
      "product_candidates",
      "supplier_listing_verifications",
      "supplier_shipping_quotes",
      "product_profitability_analyses",
    ];

    for (const table of tables) {
      const db = createFakeDb(currentSkuEvidence());
      db.failures[table] = `${table} unavailable`;

      await assert.rejects(
        () => new ProductDecisionService(db).decide("CJMY202610501AZ"),
        (error: unknown) => {
          assert.ok(error instanceof ProductDecisionDataError);
          assert.match(error.message, new RegExp(table));
          assert.equal("recommendation" in error, false);
          return true;
        },
      );
      assert.equal(db.writes.length, 0, table);
    }

    const blank = createFakeDb(currentSkuEvidence());
    blank.blankTables.product_candidates = true;
    await assert.rejects(
      () => new ProductDecisionService(blank).decide("CJMY202610501AZ"),
      (error: unknown) => {
        assert.ok(error instanceof ProductDecisionDataError);
        assert.match(error.message, /no row set/);
        assert.doesNotMatch(error.message, /investigate_further/);
        return true;
      },
    );

    const insertFailure = createFakeDb(currentSkuEvidence());
    insertFailure.insertError = "disk full";
    await assert.rejects(
      () => new ProductDecisionService(insertFailure).decide(
        "CJMY202610501AZ",
      ),
      (error: unknown) => {
        assert.ok(error instanceof ProductDecisionDataError);
        assert.match(error.message, /disk full/);
        return true;
      },
    );

    const approvedWrite = createFakeDb(currentSkuEvidence());
    approvedWrite.rewriteSaved = (row) => ({
      ...row,
      approval_status: "approved",
    });
    await assert.rejects(
      () => new ProductDecisionService(approvedWrite).decide(
        "CJMY202610501AZ",
      ),
      ProductDecisionDataError,
    );

    const app = Fastify({ logger: false });
    const failing = createFakeDb(currentSkuEvidence());
    failing.failures.supplier_shipping_quotes = "shipping read failed";
    registerProductDecisionRoute(app, new ProductDecisionService(failing));
    const response = await app.inject({
      method: "POST",
      url: "/agents/product/decide",
      headers: { "content-type": "application/json" },
      payload: { sku: "CJMY202610501AZ" },
    });

    assert.equal(response.statusCode, 500);
    assert.equal(response.json().recommendation, undefined);
    assert.match(response.json().error, /shipping read failed/);
    await app.close();
  });

  it("returns HTTP 400 for invalid decision request bodies", async () => {
    const db = createFakeDb(currentSkuEvidence());
    const app = Fastify({ logger: false });
    registerProductDecisionRoute(app, new ProductDecisionService(db));
    const bodies = [
      {},
      { sku: "" },
      { sku: " " },
      { sku: "A" },
      { sku: 12 },
      { sku: null },
    ];

    for (const body of bodies) {
      const response = await app.inject({
        method: "POST",
        url: "/agents/product/decide",
        headers: { "content-type": "application/json" },
        payload: body,
      });

      assert.equal(response.statusCode, 400, JSON.stringify(body));
      assert.equal(response.json().success, false);
      assert.equal(response.json().recommendation, undefined);
    }

    assert.equal(db.reads.length, 0);
    assert.equal(db.writes.length, 0);
    await app.close();
  });

  it("does not call Gemini, Shopify, or another paid external service", () => {
    const files = [
      "./product-decision.engine.ts",
      "./product-decision.service.ts",
    ];

    for (const file of files) {
      const source = readFileSync(
        fileURLToPath(new URL(file, import.meta.url)),
        "utf8",
      );

      assert.doesNotMatch(source, /@google\/genai|GoogleGenAI/);
      assert.doesNotMatch(source, /from ["'][^"']*gemini/);
      assert.doesNotMatch(source, /shopify/i);
      assert.doesNotMatch(source, /openai|anthropic|stripe/i);
      assert.doesNotMatch(source, /\bfetch\s*\(/);
      assert.doesNotMatch(source, /calculateExistingUnitEconomics/);
      assert.doesNotMatch(source, /from ["'][^"']*unit-economics/);
    }
  });
});

function assertNotReady(decision: ProductDecision, label: string) {
  assert.notEqual(decision.recommendation, "ready_for_review", label);
  assert.equal(decision.approval_status, "not_approved", label);
  assert.equal(decision.decision_status, "proposed", label);
}

function readyEvidence(): DecisionEvidence {
  const evidence = currentSkuEvidence();
  const verification = evidence.verifications[0];
  verification.food_contact_documentation_status = "documented";
  verification.shipping_ca_status = "verified";
  verification.shipping_us_status = "verified";

  for (const quote of evidence.quotes) {
    quote.verification_status = "verified";
    quote.destination_region = quote.market === "CA" ? "Ontario" : "California";
    quote.destination_postal_code = quote.market === "CA" ? "M5V 2T6" : "94105";
  }

  for (const analysis of evidence.analyses) {
    analysis.analysis_status = "validated";
  }

  alignAnalyses(evidence, validatedLimitations);
  return evidence;
}

function alignAnalyses(
  evidence: DecisionEvidence,
  limitations = validatedLimitations,
) {
  const verification = evidence.verifications[0];

  if (!verification) {
    return;
  }

  for (const analysis of evidence.analyses) {
    const quote = evidence.quotes.find(
      (item) =>
        item.id === analysis.shipping_quote_id &&
        item.market === analysis.market,
    );

    if (!quote) {
      continue;
    }

    analysis.verification_id = verification.id;
    analysis.listing_id = evidence.listing.id;
    analysis.currency = quote.currency;
    analysis.evidence_snapshot = evidenceSnapshot(
      evidence.listing.sku,
      verification,
      quote,
      limitations,
    );
    const calculation = analysis.calculation as Record<string, unknown>;
    calculation.market = analysis.market;
    calculation.currency = quote.currency;
  }
}

function setContributions(
  evidence: DecisionEvidence,
  values: Record<MarketCode, number>,
) {
  for (const analysis of evidence.analyses) {
    const calculation = analysis.calculation as {
      contribution_profit_after_ads?: number;
    };
    calculation.contribution_profit_after_ads =
      values[analysis.market as MarketCode];
  }
}

function supplierSnapshot(evidence: DecisionEvidence) {
  return {
    listing: evidence.listing,
    candidate: evidence.candidate,
    verifications: evidence.verifications,
    quotes: evidence.quotes,
    analyses: evidence.analyses,
  };
}

type Row = Record<string, unknown>;

function createFakeDb(evidence: DecisionEvidence) {
  const tables: Record<string, Row[]> = {
    supplier_product_listings: [evidence.listing],
    product_candidates: [evidence.candidate],
    supplier_listing_verifications: [...evidence.verifications],
    supplier_shipping_quotes: [...evidence.quotes],
    product_profitability_analyses: [...evidence.analyses],
  };
  const failures: Record<string, string> = {};
  const blankTables: Record<string, boolean> = {};
  const reads: string[] = [];
  const writes: Array<{
    table: string;
    operation: string;
    payload: Row;
  }> = [];
  const api = {
    failures,
    blankTables,
    reads,
    writes,
    insertError: undefined as string | undefined,
    rewriteSaved: undefined as ((row: Row) => Row) | undefined,
    from(table: string) {
      const query = {
        filters: [] as Array<[string, unknown]>,
        operation: "select" as "select" | "insert",
        payload: null as Row | null,
      };
      const execute = (single: boolean) => {
        if (query.operation === "insert") {
          const payload = query.payload ?? {};
          writes.push({ table, operation: "insert", payload });

          if (api.insertError) {
            return {
              data: null,
              error: { message: api.insertError },
            };
          }

          const saved = api.rewriteSaved
            ? api.rewriteSaved({
                ...payload,
                id: `decision-${writes.length}`,
              })
            : {
                ...payload,
                id: `decision-${writes.length}`,
              };

          return { data: single ? saved : [saved], error: null };
        }

        reads.push(table);

        if (failures[table]) {
          return { data: null, error: { message: failures[table] } };
        }

        if (blankTables[table]) {
          return { data: null, error: null };
        }

        const rows = (tables[table] ?? []).filter((row) =>
          query.filters.every(([column, value]) => row[column] === value),
        );

        return {
          data: single ? (rows[0] ?? null) : rows,
          error: null,
        };
      };
      const chain = {
        select() {
          return chain;
        },
        eq(column: string, value: unknown) {
          query.filters.push([column, value]);
          return chain;
        },
        insert(payload: Row) {
          query.operation = "insert";
          query.payload = payload;
          return chain;
        },
        single() {
          return Promise.resolve(execute(true));
        },
        then(
          resolve: (value: ReturnType<typeof execute>) => unknown,
          reject?: (reason: unknown) => unknown,
        ) {
          return Promise.resolve(execute(false)).then(resolve, reject);
        },
      };

      return chain;
    },
  };

  return api as ProductDecisionDb & {
    failures: Record<string, string>;
    blankTables: Record<string, boolean>;
    reads: string[];
    writes: Array<{ table: string; operation: string; payload: Row }>;
    insertError?: string;
    rewriteSaved?: (row: Row) => Row;
  };
}
