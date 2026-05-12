import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import "../../src/verify/providers/github.js";
import { getVerifier } from "../../src/verify/registry.js";

const body = Buffer.from('{"action":"ping"}');
const secret = "github-secret";
const signature = createHmac("sha256", secret).update(body).digest("hex");
const input = { rawBody: body, secret, toleranceSeconds: 300, headers: { "x-hub-signature-256": `sha256=${signature}` } };

describe("github verifier", () => {
  it("accepts a valid signature", () => expect(getVerifier("github")(input)).toEqual({ ok: true }));
  it("rejects a one-byte body change", () => expect(getVerifier("github")({ ...input, rawBody: Buffer.from('{"action":"pong"}') })).toMatchObject({ ok: false }));
  it("rejects a wrong secret", () => expect(getVerifier("github")({ ...input, secret: "wrong" })).toMatchObject({ ok: false }));
  it("rejects missing and malformed headers", () => {
    expect(getVerifier("github")({ ...input, headers: {} })).toEqual({ ok: false, reason: "missing_signature" });
    expect(getVerifier("github")({ ...input, headers: { "x-hub-signature-256": "sha256=nope!" } })).toEqual({ ok: false, reason: "malformed_signature" });
  });
});
