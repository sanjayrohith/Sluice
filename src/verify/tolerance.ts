export type TimestampFailure = "expired_timestamp" | "future_timestamp";

export function checkTimestampTolerance(
  timestampSeconds: number,
  toleranceSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000),
): TimestampFailure | undefined {
  if (timestampSeconds < nowSeconds - toleranceSeconds) return "expired_timestamp";
  if (timestampSeconds > nowSeconds + 60) return "future_timestamp";
  return undefined;
}
