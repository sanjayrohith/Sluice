import { timingSafeEqual } from "node:crypto";

export function decodeHex(value: string): Buffer | undefined {
  if (!/^(?:[0-9a-f]{2})*$/i.test(value)) {
    return undefined;
  }
  try {
    return Buffer.from(value, "hex");
  } catch {
    return undefined;
  }
}

export function timingSafeCompare(actual: Buffer, expected: Buffer): boolean {
  const length = Math.max(actual.length, expected.length);
  const left = Buffer.alloc(length);
  const right = Buffer.alloc(length);
  actual.copy(left);
  expected.copy(right);
  const equal = timingSafeEqual(left, right);
  return actual.length === expected.length && equal;
}

export function timingSafeCompareHex(actual: string, expected: string): boolean {
  const actualBytes = decodeHex(actual);
  const expectedBytes = decodeHex(expected);
  if (!actualBytes || !expectedBytes) {
    const fallback = Buffer.from(actual, "utf8");
    timingSafeCompare(fallback, Buffer.from(expected, "utf8"));
    return false;
  }
  return timingSafeCompare(actualBytes, expectedBytes);
}
