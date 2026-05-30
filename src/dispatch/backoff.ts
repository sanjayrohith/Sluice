export interface BackoffOptions {
  baseMs?: number;
  capMs?: number;
  random?: () => number;
}

const DEFAULT_BASE_MS = 5_000;
const DEFAULT_CAP_MS = 6 * 60 * 60 * 1_000;

export function calculateBackoff(attempts: number, options: BackoffOptions = {}): number {
  const baseMs = options.baseMs ?? DEFAULT_BASE_MS;
  const capMs = options.capMs ?? DEFAULT_CAP_MS;
  const random = options.random ?? Math.random;
  const idealMs = Math.min(capMs, baseMs * 2 ** Math.max(0, attempts));
  return idealMs * (0.5 + random() * 0.5);
}
