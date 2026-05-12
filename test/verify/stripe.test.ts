import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import "../../src/verify/providers/stripe.js";
import { getVerifier } from "../../src/verify/registry.js";

const body = Buffer.from('{"id":"evt_test"}');
const secret = "stripe-secret";
const timestamp = Math.floor(Date.now() / 1000);
const sign = (value: string) => createHmac("sha256", secret).update(`${timestamp}.${value}`).digest("hex");
const input = { rawBody: body, secret, toleranceSeconds: 300, headers: { "stripe-signature": `t=${timestamp},v1=${sign(body.toString())}` } };

describe("stripe verifier", () => {
  it("accepts a valid signature and rotated v1", () => {
    expect(getVerifier("stripe")({ ...input, headers: { "stripe-signature": `t=${timestamp},v1=old,v1=${sign(body.toString())}` } })).toEqual({ ok: true });
  });
  it("rejects malformed, expired, and future signatures", () => {
    expect(getVerifier("stripe")({ ...input, headers: { "stripe-signature": "v1=missing-timestamp" } })).toMatchObject({ ok: false });
    const old = timestamp - 301;
    const oldSig = createHmac("sha256", secret).update(`${old}.${body.toString()}`).digest("hex");
    expect(getVerifier("stripe")({ ...input, headers: { "stripe-signature": `t=${old},v1=${oldSig}` } })).toEqual({ ok: false, reason: "expired_timestamp" });
    const future = timestamp + 61;
    const futureSig = createHmac("sha256", secret).update(`${future}.${body.toString()}`).digest("hex");
    expect(getVerifier("stripe")({ ...input, headers: { "stripe-signature": `t=${future},v1=${futureSig}` } })).toEqual({ ok: false, reason: "future_timestamp" });
  });
});
