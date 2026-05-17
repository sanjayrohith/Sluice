const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const MAX_HEADER_VALUE_BYTES = 8 * 1024;

export function normalizeHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [name, rawValue] of Object.entries(headers)) {
    const lowerName = name.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lowerName) || rawValue === undefined) continue;

    const value = Array.isArray(rawValue) ? (rawValue[0] ?? "") : rawValue;
    normalized[lowerName] = truncateUtf8(value, MAX_HEADER_VALUE_BYTES);
  }

  return normalized;
}

function truncateUtf8(value: string, maxBytes: number): string {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.byteLength <= maxBytes) return value;

  let truncated = bytes.subarray(0, maxBytes).toString("utf8");
  while (Buffer.byteLength(truncated, "utf8") > maxBytes) {
    truncated = truncated.slice(0, -1);
  }
  return truncated;
}
