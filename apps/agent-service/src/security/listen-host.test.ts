import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveListenHost } from "./listen-host.js";

describe("agent service listen host", () => {
  it("binds to loopback unless a private-network override is explicit", () => {
    assert.equal(resolveListenHost({}), "127.0.0.1");
    assert.equal(resolveListenHost({ HOST: "localhost" }), "127.0.0.1");
    assert.equal(resolveListenHost({ HOST: "::1" }), "::1");
    assert.throws(
      () => resolveListenHost({ HOST: "0.0.0.0" }),
      /outside localhost/,
    );
    assert.equal(
      resolveListenHost({
        HOST: "10.0.0.8",
        ALLOW_NON_LOOPBACK_BIND: "true",
      }),
      "10.0.0.8",
    );
  });
});
