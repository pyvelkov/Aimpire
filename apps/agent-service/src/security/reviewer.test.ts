import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveReviewer } from "./reviewer.js";

const OWNER = "11111111-1111-4111-8111-111111111111";

describe("reviewer identity", () => {
  it("accepts only the configured auth user id", () => {
    assert.deepEqual(
      resolveReviewer(OWNER, { DASHBOARD_OWNER_USER_ID: OWNER }),
      { ok: true, actorId: OWNER },
    );
    assert.deepEqual(
      resolveReviewer("22222222-2222-4222-8222-222222222222", { DASHBOARD_OWNER_USER_ID: OWNER }),
      { ok: false, status: 403 },
    );
    assert.deepEqual(
      resolveReviewer(null, { DASHBOARD_OWNER_USER_ID: OWNER }),
      { ok: false, status: 403 },
    );
    assert.deepEqual(
      resolveReviewer(OWNER, {}),
      { ok: false, status: 503 },
    );
    assert.deepEqual(
      resolveReviewer("owner@example.com", { DASHBOARD_OWNER_USER_ID: OWNER }),
      { ok: false, status: 403 },
    );
  });
});
