import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Fastify from "fastify";
import { describe, it } from "node:test";
import {
  registerProductManagementRoutes,
  type ProductManagementApi,
} from "./product-management.routes.js";
import { ProductNotFoundError } from "../services/product-management.service.js";
import { registerPrivateAccess } from "../security/private-access.js";

const SECRET = "product-route-secret-0123456789";
const PRODUCT_ID = "73e6e4bd-41d8-497f-9c65-5a5d249ce329";

function api(): ProductManagementApi {
  return {
    async products() {
      return [{
        id: PRODUCT_ID,
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
      }];
    },
    async productDetail(id: string) {
      if (id !== PRODUCT_ID) {
        throw new ProductNotFoundError();
      }
      return {
        product: {
          id,
          name: "Slow Feeder Pet Bowls",
          description: null,
          category: "Pet supplies",
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
        gaps: ["No supplier discoveries"],
      };
    },
  };
}

async function createApp() {
  const app = Fastify({ logger: false });
  registerPrivateAccess(app, { secret: SECRET });
  registerProductManagementRoutes(app, api());
  await app.ready();
  return app;
}

describe("product management routes", () => {
  it("requires the internal secret before returning product evidence", async () => {
    const app = await createApp();
    const denied = await app.inject({
      method: "GET",
      url: `/dashboard/products/${PRODUCT_ID}`,
      remoteAddress: "127.0.0.1",
    });
    const allowed = await app.inject({
      method: "GET",
      url: `/dashboard/products/${PRODUCT_ID}`,
      remoteAddress: "127.0.0.1",
      headers: { "x-aimpire-internal-secret": SECRET },
    });
    const body = allowed.json();

    assert.equal(denied.statusCode, 401);
    assert.equal(allowed.statusCode, 200);
    assert.equal(body.product.product.name, "Slow Feeder Pet Bowls");
    assert.equal(JSON.stringify(body).includes(SECRET), false);
    await app.close();
  });

  it("rejects invalid ids, unknown products, and write methods", async () => {
    const app = await createApp();
    const headers = { "x-aimpire-internal-secret": SECRET };
    const invalid = await app.inject({
      method: "GET",
      url: "/dashboard/products/not-a-uuid",
      remoteAddress: "127.0.0.1",
      headers,
    });
    const missing = await app.inject({
      method: "GET",
      url: "/dashboard/products/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      remoteAddress: "127.0.0.1",
      headers,
    });
    const posted = await app.inject({
      method: "POST",
      url: "/dashboard/products",
      remoteAddress: "127.0.0.1",
      headers,
    });
    const list = await app.inject({
      method: "GET",
      url: "/dashboard/products",
      remoteAddress: "203.0.113.10",
      headers,
    });

    assert.equal(invalid.statusCode, 400);
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().error, "Product not found");
    assert.equal(posted.statusCode, 404);
    assert.equal(list.statusCode, 200);
    assert.equal(list.json().products[0].latest_decision.approved, false);
    assert.equal(list.json().products[0].latest_decision.approval_label, "Not approved");
    await app.close();
  });

  it("registers only read endpoints", () => {
    const source = readFileSync(new URL("./product-management.routes.ts", import.meta.url), "utf8");
    assert.match(source, /app\.get\("\/dashboard\/products"/);
    assert.match(source, /app\.get\("\/dashboard\/products\/:id"/);
    assert.doesNotMatch(source, /app\.(post|put|patch|delete)\(/);
  });
});
