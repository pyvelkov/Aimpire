import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DashboardAccessError, DashboardNotFoundError, DashboardUpstreamError, DashboardWorkflowError } from "./errors";
import {
  dashboardRequestUrl,
  isDashboardResource,
  requestDashboardResource,
} from "./dashboard-resources";
import { stripSensitive } from "./sensitive";

const SECRET = "internal-secret-value-0123456789";

describe("dashboard data access", () => {
  it("puts the internal secret in a header and strips it from responses", async () => {
    let capturedUrl = "";
    let capturedSecret = "";
    const payload = await requestDashboardResource("product-decisions", {
      baseUrl: "http://127.0.0.1:3000",
      secret: SECRET,
      fetchImpl: async (url, init) => {
        capturedUrl = String(url);
        capturedSecret = new Headers(init?.headers).get("x-aimpire-internal-secret") ?? "";
        return new Response(JSON.stringify({
          success: true,
          decisions: [],
          internal_api_secret: SECRET,
          nested: { note: `leaked ${SECRET}` },
          service: "sb_secret_should_not_pass",
        }), { status: 200 });
      },
    });
    const serialized = JSON.stringify(payload);

    assert.equal(capturedUrl, "http://127.0.0.1:3000/dashboard/product-decisions");
    assert.equal(capturedUrl.includes(SECRET), false);
    assert.equal(capturedSecret, SECRET);
    assert.equal(serialized.includes(SECRET), false);
    assert.equal(serialized.includes("sb_secret_"), false);
    assert.equal(serialized.includes("internal_api_secret"), false);
  });

  it("fails closed without a secret and does not call the agent service", async () => {
    let called = false;
    await assert.rejects(
      () => requestDashboardResource("overview", {
        baseUrl: "http://127.0.0.1:3000",
        secret: "",
        fetchImpl: async () => {
          called = true;
          return new Response("{}", { status: 200 });
        },
      }),
      (error: unknown) => error instanceof DashboardAccessError && error.status === 503,
    );
    assert.equal(called, false);
    assert.equal(dashboardRequestUrl("http://127.0.0.1:3000", "activity").includes("?"), false);
  });

  it("removes sensitive keys from nested payloads", () => {
    const cleaned = stripSensitive({
      ok: true,
      supabase_secret_key: "hidden",
      children: [{ password: "hidden", name: "Bowl" }],
    });

    assert.deepEqual(cleaned, {
      ok: true,
      children: [{ name: "Bowl" }],
    });
  });

  it("requests one product by id and turns a missing record into not found", async () => {
    const id = "73e6e4bd-41d8-497f-9c65-5a5d249ce329";
    const url = dashboardRequestUrl("http://127.0.0.1:3000", `products/${id}`);
    assert.equal(url, `http://127.0.0.1:3000/dashboard/products/${id}`);
    assert.equal(url.includes(SECRET), false);

    await assert.rejects(
      () => requestDashboardResource(`products/${id}`, {
        baseUrl: "http://127.0.0.1:3000",
        secret: SECRET,
        fetchImpl: async () => new Response(JSON.stringify({
          error: "Product not found",
          leaked: SECRET,
        }), { status: 404 }),
      }),
      (error: unknown) => error instanceof DashboardNotFoundError && !String(error.message).includes(SECRET),
    );
    assert.throws(() => dashboardRequestUrl("http://127.0.0.1:3000", "products/not-a-uuid"));
  });

  it("shows domain review errors and hides database failures", async () => {
    const messages: Record<string, { status: number; message: string }> = {
      unauthorized_reviewer: { status: 403, message: "This dashboard is limited to the Aimpire owner" },
      stale_evidence: { status: 409, message: "The supplier evidence or source decision changed. This review was not recorded." },
      superseded_decision: { status: 409, message: "A newer decision exists for this product. Request a review of that decision." },
      duplicate_request: { status: 409, message: "A review request already exists for this decision." },
    };
    for (const [code, expected] of Object.entries(messages)) {
      await assert.rejects(
        () => requestDashboardResource("approvals", {
          baseUrl: "http://127.0.0.1:3000",
          secret: SECRET,
          method: "POST",
          fetchImpl: async () => new Response(JSON.stringify({
            success: false,
            error: code,
            detail: "column reference verification_id is ambiguous",
          }), { status: expected.status }),
        }),
        (error: unknown) => error instanceof DashboardWorkflowError
          && error.status === expected.status
          && error.message === expected.message
          && !error.message.includes("verification_id"),
      );
    }

    await assert.rejects(
      () => requestDashboardResource("approvals", {
        baseUrl: "http://127.0.0.1:3000",
        secret: SECRET,
        method: "POST",
        fetchImpl: async () => new Response(JSON.stringify({
          success: false,
          error: "Failed to load dashboard data",
          detail: "column reference verification_id is ambiguous sb_secret_hidden",
        }), { status: 500 }),
      }),
      (error: unknown) => error instanceof DashboardUpstreamError
        && !error.message.includes("verification_id")
        && !error.message.includes("sb_secret_"),
    );
  });

  it("does not route scheduler status through the public dashboard", () => {
    assert.equal(isDashboardResource("scheduler"), false);
    assert.throws(
      () => dashboardRequestUrl("http://127.0.0.1:3000", "scheduler"),
      (error: unknown) => error instanceof DashboardUpstreamError,
    );
  });
});
