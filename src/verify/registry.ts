import type { Verifier } from "./types.js";

const verifiers = new Map<string, Verifier>();

export function registerVerifier(provider: string, verifier: Verifier): void {
  verifiers.set(provider, verifier);
}

export function getVerifier(provider: string): Verifier {
  const verifier = verifiers.get(provider);
  if (!verifier) {
    throw new Error(`Unknown webhook provider: ${provider}`);
  }
  return verifier;
}
