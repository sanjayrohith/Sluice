import { createHmac } from "node:crypto";

import { registerVerifier } from "../registry.js";
import { timingSafeCompareHex } from "../timingSafe.js";
import type { Verifier } from "../types.js";

export const razorpayVerifier: Verifier = ({ rawBody, headers, secret }) => {
  const signature = headers["x-razorpay-signature"] ?? headers["X-Razorpay-Signature"];
  if (!signature) return { ok: false, reason: "missing_signature" };
  if (!/^[0-9a-f]+$/i.test(signature)) return { ok: false, reason: "malformed_signature" };

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return timingSafeCompareHex(signature, expected)
    ? { ok: true }
    : { ok: false, reason: "invalid_signature" };
};

registerVerifier("razorpay", razorpayVerifier);
