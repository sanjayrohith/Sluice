import type { TransformEvent } from "./types.js";

export function buildTransformInput(
  id: string | number,
  source: string,
  headers: Record<string, string>,
  rawBody: Buffer,
): TransformEvent {
  let body: unknown | null = null;
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch {
    // Non-JSON webhook bodies are intentionally represented by rawBody only.
  }

  return deepFreeze({
    id: String(id),
    source,
    headers: { ...headers },
    body,
    rawBody: rawBody.toString("utf8"),
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
