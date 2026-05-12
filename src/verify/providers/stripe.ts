import { createHmac } from "node:crypto";

import { registerVerifier } from "../registry.js";
import { timingSafeCompareHex } from "../timingSafe.js";
import type { Verifier } from "../types.js";
import { checkTimestampTolerance } from "../tolerance.js";

export const stripeVerifier: Verifier = ({ rawBody, headers, secret, toleranceSeconds }) => {
  const signature = headers["stripe-signature"] ?? headers["Stripe-Signature"];
  if (!signature) return { ok: false, reason: "missing_signature" };

  const values = new Map<string, string[]>();
  for (const part of signature.split(",")) {
    const separator = part.indexOf("=");
    if (separator < 1) return { ok: false, reason: "malformed_signature" };
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    values.set(key, [...(values.get(key) ?? []), value]);
  }

  const timestamp = values.get("t")?.[0];
  const signatures = values.get("v1") ?? [];
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) {
    return { ok: false, reason: "malformed_signature" };
  }

  const timestampFailure = checkTimestampTolerance(Number(timestamp), toleranceSeconds);
  if (timestampFailure) return { ok: false, reason: timestampFailure };

  const payload = `${timestamp}.${rawBody.toString("utf8")}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  return signatures.some((candidate) => timingSafeCompareHex(candidate, expected))
    ? { ok: true }
    : { ok: false, reason: "invalid_signature" };
};

registerVerifier("stripe", stripeVerifier);
