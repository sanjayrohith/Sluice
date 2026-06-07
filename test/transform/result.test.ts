import { describe, expect, it } from "vitest";

import {
  resolveTransformDestinations,
  serializeTransformBody,
  validateTransformResult,
} from "../../src/transform/result.js";

describe("validateTransformResult", () => {
  it("treats null and undefined as drops", () => {
    expect(validateTransformResult(null)).toEqual({ kind: "drop" });
    expect(validateTransformResult(undefined)).toEqual({ kind: "drop" });
  });

  it("accepts an object with optional destinations", () => {
    expect(validateTransformResult({ body: { ok: true }, destinations: ["billing"] })).toEqual({
      kind: "deliver",
      value: { body: { ok: true }, destinations: ["billing"] },
    });
  });

  it("rejects scalar and malformed destination results", () => {
    expect(() => validateTransformResult("drop")).toThrow();
    expect(() => validateTransformResult({ destinations: ["ok", 1] })).toThrow();
  });

  it("resolves configured fan-out destinations and rejects unknown names", () => {
    const configured = new Map([["billing", {}], ["analytics", {}]]);
    expect(resolveTransformDestinations(["billing", "analytics"], configured)).toEqual([
      "billing",
      "analytics",
    ]);
    expect(() => resolveTransformDestinations(["unknown"], configured)).toThrow();
  });

  it("serializes a body override as JSON bytes", () => {
    expect(serializeTransformBody({ amount: 42 }).toString()).toBe('{"amount":42}');
  });
});
