import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DashboardAccessError, DashboardUpstreamError } from "./errors";
import { handleDashboardRequest } from "./dashboard-handler";

const SECRET = "handler-secret-value-0123456789";

describe("protected dashboard API", () => {
  it("rejects anonymous and non-owner callers before loading data", async () => {
    let loaded = false;
    const unauthorized = await handleDashboardRequest({
      resource: "overview",
      authorize: async () => {
        throw new DashboardAccessError(401, "Authentication required");
      },
      load: async () => {
        loaded = true;
        return { success: true };
      },
    });
    const forbidden = await handleDashboardRequest({
      resource: "product-decisions",
      authorize: async () => {
        throw new DashboardAccessError(403, "This dashboard is limited to the Aimpire owner");
      },
      load: async () => {
        loaded = true;
        return { success: true };
      },
    });

    assert.equal(unauthorized.status, 401);
    assert.equal(forbidden.status, 403);
    assert.equal(loaded, false);
    assert.equal(JSON.stringify(forbidden.body).includes(SECRET), false);
  });

  it("returns read-only data for the owner and redacts secrets", async () => {
    const result = await handleDashboardRequest({
      resource: "activity",
      authorize: async () => undefined,
      secrets: [SECRET],
      load: async () => ({
        success: true,
        count: 0,
        activity: [],
        token: SECRET,
      }),
    });

    assert.equal(result.status, 200);
    assert.equal(JSON.stringify(result.body).includes(SECRET), false);
    assert.equal(JSON.stringify(result.body).includes("token"), false);
  });

  it("hides upstream failures and unknown resources", async () => {
    const missing = await handleDashboardRequest({
      resource: "execute-next",
      authorize: async () => undefined,
      load: async () => ({ success: true }),
    });
    const failed = await handleDashboardRequest({
      resource: "overview",
      authorize: async () => undefined,
      load: async () => {
        throw new DashboardUpstreamError("database password=sb_secret_hidden");
      },
    });

    assert.equal(missing.status, 404);
    assert.equal(failed.status, 502);
    assert.equal(JSON.stringify(failed.body).includes("sb_secret_"), false);
    assert.equal(JSON.stringify(failed.body).includes("password"), false);
  });
});
