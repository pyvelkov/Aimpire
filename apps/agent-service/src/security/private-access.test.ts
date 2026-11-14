import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Fastify from "fastify";
import { describe, it } from "node:test";
import { registerPrivateAccess } from "./private-access.js";

const SECRET = "stage-6-internal-secret";

async function createApp() {
  const app = Fastify({ logger: false });
  registerPrivateAccess(app, { secret: SECRET });
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/health/database", async () => ({ database: "connected" }));
  app.post("/agents/ceo/plan", async () => ({ success: true }));
  app.post("/finance/calculate", async () => ({ success: true }));
  app.get("/dashboard/overview", async () => ({
    success: true,
    overview: { product_candidates: { count: 0 } },
  }));
  await app.ready();
  return app;
}

describe("private access control", () => {
  it("rejects operational routes from outside localhost", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/agents/ceo/plan",
      remoteAddress: "203.0.113.10",
      payload: { objective: "Launch a product without review" },
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.json().success, false);
    await app.close();
  });

  it("rejects finance and database routes from outside localhost", async () => {
    const app = await createApp();
    const finance = await app.inject({
      method: "POST",
      url: "/finance/calculate",
      remoteAddress: "198.51.100.20",
    });
    const database = await app.inject({
      method: "GET",
      url: "/health/database",
      remoteAddress: "198.51.100.20",
    });

    assert.equal(finance.statusCode, 403);
    assert.equal(database.statusCode, 403);
    await app.close();
  });

  it("allows operational routes from loopback", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/agents/ceo/plan",
      remoteAddress: "127.0.0.1",
      payload: {},
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().success, true);
    await app.close();
  });

  it("rejects dashboard reads when the internal secret is missing or wrong", async () => {
    const app = await createApp();
    const missing = await app.inject({
      method: "GET",
      url: "/dashboard/overview",
      remoteAddress: "127.0.0.1",
    });
    const wrong = await app.inject({
      method: "GET",
      url: "/dashboard/overview",
      remoteAddress: "127.0.0.1",
      headers: { "x-aimpire-internal-secret": "not-the-secret" },
    });

    assert.equal(missing.statusCode, 401);
    assert.equal(wrong.statusCode, 401);
    assert.equal(JSON.stringify(missing.json()).includes(SECRET), false);
    assert.equal(JSON.stringify(wrong.json()).includes(SECRET), false);
    await app.close();
  });

  it("allows dashboard reads with the internal secret and does not echo it", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/dashboard/overview",
      remoteAddress: "203.0.113.10",
      headers: { "x-aimpire-internal-secret": SECRET },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().success, true);
    assert.equal(JSON.stringify(response.json()).includes(SECRET), false);
    await app.close();
  });

  it("fails closed when the server has no internal secret configured", async () => {
    const app = Fastify({ logger: false });
    const previous = process.env.INTERNAL_API_SECRET;
    delete process.env.INTERNAL_API_SECRET;
    registerPrivateAccess(app);
    app.get("/dashboard/overview", async () => ({ success: true }));
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/dashboard/overview",
      remoteAddress: "127.0.0.1",
      headers: { "x-aimpire-internal-secret": "anything" },
    });

    assert.equal(response.statusCode, 401);
    if (previous === undefined) {
      delete process.env.INTERNAL_API_SECRET;
    } else {
      process.env.INTERNAL_API_SECRET = previous;
    }
    await app.close();
  });

  it("keeps the process bound to localhost in the server entrypoint", () => {
    const source = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
    const hookAt = source.indexOf("registerPrivateAccess(app)");
    const firstRouteAt = source.indexOf('app.get("/health"');

    assert.ok(hookAt > 0);
    assert.ok(firstRouteAt > hookAt);
    assert.match(source, /resolveListenHost\(\)/);
    assert.equal(source.includes("0.0.0.0"), false);
    assert.match(source, /registerDashboardRoutes\(/);
  });
});
