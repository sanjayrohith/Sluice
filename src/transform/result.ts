export interface ValidTransformResult {
  body?: unknown;
  destinations?: string[];
}

export type TransformResult =
  | { kind: "drop" }
  | { kind: "deliver"; value: ValidTransformResult };

export function validateTransformResult(value: unknown): TransformResult {
  if (value === null || value === undefined) return { kind: "drop" };
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("transform must return an object, null, or undefined");
  }

  const record = value as Record<string, unknown>;
  if (record.destinations !== undefined) {
    if (
      !Array.isArray(record.destinations) ||
      record.destinations.some((destination) => typeof destination !== "string" || destination.length === 0)
    ) {
      throw new Error("transform destinations must be a non-empty string array");
    }
  }

  return {
    kind: "deliver",
    value: {
      body: record.body,
      destinations: record.destinations as string[] | undefined,
    },
  };
}
