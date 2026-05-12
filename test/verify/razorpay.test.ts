import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import "../../src/verify/providers/razorpay.js";
import { getVerifier } from "../../src/verify/registry.js";

const body = Buffer.from('{"payment":"created"}');
const secret = "razorpay-secret";
const signature = createHmac("sha256", secret).update(body).digest("hex");

describe("razorpay verifier", () => {
  it("accepts a valid signature", () => expect(getVerifier("razorpay")({ rawBody: body, secret, toleranceSeconds: 300, headers: { "x-razorpay-signature": signature } })).toEqual({ ok: true }));
  it("rejects wrong, missing, and malformed signatures", () => {
    const base = { rawBody: body, secret, toleranceSeconds: 300, headers: { "x-razorpay-signature": signature } };
    expect(getVerifier("razorpay")({ ...base, secret: "wrong" })).toMatchObject({ ok: false });
    expect(getVerifier("razorpay")({ ...base, headers: {} })).toEqual({ ok: false, reason: "missing_signature" });
    expect(getVerifier("razorpay")({ ...base, headers: { "x-razorpay-signature": "not-hex" } })).toEqual({ ok: false, reason: "malformed_signature" });
  });
});
