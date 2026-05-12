import { createHmac } from "node:crypto";

import { registerVerifier } from "../registry.js";
import { timingSafeCompareHex } from "../timingSafe.js";
import type { Verifier } from "../types.js";

function header(headers: Record<string, string | undefined>, name: string): string | undefined {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1];
}

export const githubVerifier: Verifier = ({ rawBody, headers, secret }) => {
  const signature = header(headers, "x-hub-signature-256");
  if (!signature) return { ok: false, reason: "missing_signature" };
  if (!/^sha256=[0-9a-f]+$/i.test(signature)) return { ok: false, reason: "malformed_signature" };

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return timingSafeCompareHex(signature.slice("sha256=".length), expected)
    ? { ok: true }
    : { ok: false, reason: "invalid_signature" };
};

registerVerifier("github", githubVerifier);
