import "dotenv/config";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { currentSkuEvidence } from "./product-decision.fixture.js";
import type { DecisionEvidence } from "./product-decision.engine.js";
import {
  ProductDecisionDataError,
  ProductDecisionRequestError,
  ProductDecisionService,
  isLocalDecisionRequest,
  readDecisionThresholds,
  registerProductDecisionRoute,
  type ProductDecisionDb,
} from "./product-decision.service.js";

type Row = Record<string, unknown>;

describe("product decision service", () => {
  it("saves the current SKU as proposed and not approved on every request", async () => {
    const evidence = currentSkuEvidence();
    const db = createFakeDb(evidence);
    const service = new ProductDecisionService(db);

    const first = await service.decide(evidence.listing.sku);
    const second = await service.decide(` ${evidence.listing.sku.toLowerCase()} `);

    assert.equal(first.recommendation, "investigate_further");
    assert.equal(second.recommendation, "investigate_further");
    assert.equal(first.approval_status, "not_approved");
    assert.equal(second.approval_status, "not_approved");
    assert.equal(first.decision_status, "proposed");
    assert.equal(second.decision_status, "proposed");
    assert.equal(evidence.candidate.status, "discovered");
    assert.equal(evidence.listing.verification_status, "unverified");
    assert.equal(evidence.analyses[0].approval_status, "not_approved");
    assert.equal(evidence.analyses[1].approval_status, "not_approved");
    assert.deepEqual(
      db.writes.map((write) => write.operation),
      ["insert", "insert"],
    );
    assert.deepEqual(
      db.writes.map((write) => write.table),
      ["product_decisions", "product_decisions"],
    );
    assert.deepEqual(
      db.writes.map((write) => write.payload.approval_status),
      ["not_approved", "not_approved"],
    );
    assert.deepEqual(
      db.writes.map((write) => write.payload.decision_status),
      ["proposed", "proposed"],
    );
  });

  it("returns HTTP 400 for an invalid SKU and does not query the database", async () => {
    const db = createFakeDb(currentSkuEvidence());
    const app = Fastify({ logger: false });
    registerProductDecisionRoute(
      app,
      new ProductDecisionService(db),
    );

    const response = await app.inject({
      method: "POST",
      url: "/agents/product/decide",
      headers: { "content-type": "application/json" },
      payload: { sku: "A" },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().success, false);
    assert.equal(response.json().error, "Invalid SKU");
    assert.equal(db.reads.length, 0);
    assert.equal(db.writes.length, 0);
    await app.close();
  });

  it("returns HTTP 400 when the SKU does not match one listing", async () => {
    const missing = createFakeDb(currentSkuEvidence());
    missing.tables.supplier_product_listings = [];
    const ambiguous = createFakeDb(currentSkuEvidence());
    ambiguous.tables.supplier_product_listings = [
      currentSkuEvidence().listing,
      {
        ...currentSkuEvidence().listing,
        id: "second-listing",
      },
    ];

    for (const [db, message] of [
      [missing, "Invalid SKU"],
      [ambiguous, "Ambiguous SKU: expected exactly one supplier listing"],
    ] as const) {
      const app = Fastify({ logger: false });
      registerProductDecisionRoute(
        app,
        new ProductDecisionService(db),
      );
      const response = await app.inject({
        method: "POST",
        url: "/agents/product/decide",
        headers: { "content-type": "application/json" },
        payload: { sku: "CJMY202610501AZ" },
      });

      assert.equal(response.statusCode, 400);
      assert.equal(response.json().error, message);
      assert.equal(db.writes.length, 0);
      await app.close();
    }
  });

  it("does not treat a database error as missing evidence", async () => {
    const listingFailure = createFakeDb(currentSkuEvidence());
    listingFailure.failures.supplier_product_listings =
      "connection refused";
    const analysisFailure = createFakeDb(currentSkuEvidence());
    analysisFailure.failures.product_profitability_analyses =
      "statement timeout";

    await assert.rejects(
      () => new ProductDecisionService(listingFailure).decide(
        "CJMY202610501AZ",
      ),
      (error: unknown) => {
        assert.ok(error instanceof ProductDecisionDataError);
        assert.match(error.message, /connection refused/);
        assert.doesNotMatch(error.message, /missing/i);
        return true;
      },
    );
    assert.equal(listingFailure.writes.length, 0);

    await assert.rejects(
      () => new ProductDecisionService(analysisFailure).decide(
        "CJMY202610501AZ",
      ),
      (error: unknown) => {
        assert.ok(error instanceof ProductDecisionDataError);
        assert.match(error.message, /statement timeout/);
        assert.doesNotMatch(error.message, /investigate_further/);
        return true;
      },
    );
    assert.equal(analysisFailure.writes.length, 0);

    const app = Fastify({ logger: false });
    registerProductDecisionRoute(
      app,
      new ProductDecisionService(listingFailure),
    );
    const response = await app.inject({
      method: "POST",
      url: "/agents/product/decide",
      headers: { "content-type": "application/json" },
      payload: { sku: "CJMY202610501AZ" },
    });

    assert.equal(response.statusCode, 500);
    assert.equal(response.json().success, false);
    assert.equal(response.json().recommendation, undefined);
    assert.match(response.json().error, /connection refused/);
    await app.close();
  });

  it("rejects a non-local request before deciding", async () => {
    let called = false;
    const app = Fastify({ logger: false });
    registerProductDecisionRoute(app, {
      async decide() {
        called = true;
        throw new Error("should not decide");
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/agents/product/decide",
      remoteAddress: "203.0.113.10",
      headers: { "content-type": "application/json" },
      payload: { sku: "CJMY202610501AZ" },
    });

    assert.equal(response.statusCode, 403);
    assert.equal(called, false);
    assert.equal(isLocalDecisionRequest("203.0.113.10"), false);
    assert.equal(isLocalDecisionRequest("127.0.0.1"), true);
    await app.close();
  });

  it("rejects an unreadable profitability threshold instead of defaulting it", () => {
    assert.throws(
      () => readDecisionThresholds({
        PRODUCT_DECISION_MIN_CONTRIBUTION_AFTER_ADS: "nope",
      } as NodeJS.ProcessEnv),
      ProductDecisionDataError,
    );
  });

  it("rejects a direct invalid SKU before reading the database", async () => {
    const db = createFakeDb(currentSkuEvidence());

    await assert.rejects(
      () => new ProductDecisionService(db).decide("A"),
      ProductDecisionRequestError,
    );
    assert.equal(db.reads.length, 0);
  });

  it("does not write through update, upsert, or delete", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./product-decision.service.ts", import.meta.url)),
      "utf8",
    );

    assert.doesNotMatch(source, /\.update\s*\(/);
    assert.doesNotMatch(source, /\.upsert\s*\(/);
    assert.doesNotMatch(source, /\.delete\s*\(/);
  });
});

function createFakeDb(evidence: DecisionEvidence) {
  const tables: Record<string, Row[]> = {
    supplier_product_listings: [evidence.listing],
    product_candidates: [evidence.candidate],
    supplier_listing_verifications: evidence.verifications,
    supplier_shipping_quotes: evidence.quotes,
    product_profitability_analyses: evidence.analyses,
    product_decisions: [],
  };
  const failures: Record<string, string> = {};
  const reads: string[] = [];
  const writes: Array<{
    table: string;
    operation: string;
    payload: Row;
  }> = [];

  const db = {
    from(table: string) {
      const state = {
        filters: [] as Array<[string, unknown]>,
        operation: "select" as "select" | "insert",
        payload: null as Row | null,
      };
      const execute = (single: boolean) => {
        if (state.operation === "insert") {
          const payload = state.payload ?? {};
          writes.push({
            table,
            operation: "insert",
            payload,
          });
          const saved = {
            ...payload,
            id: `decision-${writes.length}`,
          };
          return {
            data: single ? saved : [saved],
            error: null,
          };
        }

        reads.push(table);
        const failure = failures[table];

        if (failure) {
          return {
            data: null,
            error: { message: failure },
          };
        }

        const rows = (tables[table] ?? []).filter((row) =>
          state.filters.every(([column, value]) => row[column] === value),
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
          state.filters.push([column, value]);
          return chain;
        },
        insert(payload: Row) {
          state.operation = "insert";
          state.payload = payload;
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

  return Object.assign(db, {
    tables,
    failures,
    reads,
    writes,
  }) as ProductDecisionDb & {
    tables: Record<string, Row[]>;
    failures: Record<string, string>;
    reads: string[];
    writes: Array<{
      table: string;
      operation: string;
      payload: Row;
    }>;
  };
}
