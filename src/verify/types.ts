export interface VerifyInput {
  rawBody: Buffer;
  headers: Record<string, string | undefined>;
  secret: string;
  toleranceSeconds: number;
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };
export type Verifier = (input: VerifyInput) => VerifyResult;
