import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasValidInternalSecret, secretsMatch } from "./internal-auth.js";

describe("internal API secret", () => {
  it("rejects a missing, empty, or different secret", () => {
    assert.equal(hasValidInternalSecret(null, "expected-secret"), false);
    assert.equal(hasValidInternalSecret("", "expected-secret"), false);
    assert.equal(hasValidInternalSecret("expected-secret", undefined), false);
    assert.equal(hasValidInternalSecret("expected-secret", ""), false);
    assert.equal(hasValidInternalSecret("other-secret", "expected-secret"), false);
    assert.equal(secretsMatch("short", "expected-secret-value"), false);
  });

  it("accepts an exact secret without requiring equal string lengths first", () => {
    assert.equal(
      hasValidInternalSecret("expected-secret", "expected-secret"),
      true,
    );
  });
});
