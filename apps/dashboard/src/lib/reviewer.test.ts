import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { authorizeReviewer } from "./reviewer";

const OWNER = "11111111-1111-4111-8111-111111111111";

describe("owner reviewer authorization", () => {
  it("requires the immutable auth user id and a valid session", () => {
    const expired = authorizeReviewer({
      userId: null,
      email: "owner@example.com",
      ownerUserId: OWNER,
      ownerEmail: "owner@example.com",
    });
    const unconfigured = authorizeReviewer({
      userId: OWNER,
      email: "owner@example.com",
      ownerUserId: "",
      ownerEmail: "owner@example.com",
    });
    const wrongId = authorizeReviewer({
      userId: "22222222-2222-4222-8222-222222222222",
      email: "owner@example.com",
      ownerUserId: OWNER,
      ownerEmail: "owner@example.com",
    });
    const wrongEmail = authorizeReviewer({
      userId: OWNER,
      email: "other@example.com",
      ownerUserId: OWNER,
      ownerEmail: "owner@example.com",
    });
    assert.equal(expired.ok, false);
    assert.equal(unconfigured.ok, false);
    assert.equal(wrongId.ok, false);
    assert.equal(wrongEmail.ok, false);
    if (!expired.ok) assert.equal(expired.status, 401);
    if (!unconfigured.ok) assert.equal(unconfigured.status, 503);
    if (!wrongId.ok) assert.equal(wrongId.status, 403);
    if (!wrongEmail.ok) assert.equal(wrongEmail.status, 403);
    assert.deepEqual(authorizeReviewer({
      userId: OWNER,
      email: "Owner@Example.com",
      ownerUserId: OWNER,
      ownerEmail: "owner@example.com",
    }), { ok: true, userId: OWNER });
  });
});
