/**
 * Extract a scalar value from a webhook payload using the supported JSONPath
 * subset: $.field.nested[0].field.
 */
const parsedPathCache = new Map<string, Array<string | number> | null>();

function getParsedPath(path: string): Array<string | number> | null {
  const cached = parsedPathCache.get(path);
  if (cached !== undefined) {
    return cached;
  }
  const parsed = parsePath(path);
  parsedPathCache.set(path, parsed);
  return parsed;
}

export function extractDedupKey(rawBody: Buffer, path?: string): string | null {
  if (!path) return null;

  const segments = getParsedPath(path);
  if (!segments) return null;

  let value: unknown;
  try {
    value = JSON.parse(rawBody.toString("utf8")) as unknown;
  } catch {
    return null;
  }

  for (const segment of segments) {
    if (typeof segment === "number") {
      if (!Array.isArray(value) || segment >= value.length) return null;
      value = value[segment];
    } else {
      if (typeof value !== "object" || value === null || !(segment in value)) return null;
      value = (value as Record<string, unknown>)[segment];
    }
  }

  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return null;
}

function parsePath(path: string): Array<string | number> | null {
  if (!path.startsWith("$.")) return null;

  const segments: Array<string | number> = [];
  let cursor = 1;
  const tokenPattern = /\.([A-Za-z_][A-Za-z0-9_]*)|\[(\d+)\]/g;
  while (cursor < path.length) {
    tokenPattern.lastIndex = cursor;
    const match = tokenPattern.exec(path);
    if (!match || match.index !== cursor) return null;
    segments.push(match[1] ?? Number(match[2]));
    cursor = tokenPattern.lastIndex;
  }
  return segments.length > 0 ? segments : null;
}
