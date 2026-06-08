import { describe, expect, it } from "vitest";

import { TransformMemoryError, TransformTimeoutError } from "../../src/transform/errors.js";
import { evaluateTransform } from "../../src/transform/runtime.js";
import { resolveTransformDestinations, serializeTransformBody, validateTransformResult } from "../../src/transform/result.js";

describe("transform sandbox", () => {
  it("kills an infinite loop at the wall-clock deadline", async () => {
    await expect(
      evaluateTransform("export default function () { while (true) {} }", {}),
    ).rejects.toBeInstanceOf(TransformTimeoutError);
  });

  it("enforces the QuickJS memory ceiling", async () => {
    await expect(
      evaluateTransform(
        'export default function () { const values = []; while (true) values.push("x".repeat(1024)); }',
        {},
        { timeoutMs: 1_000, memoryLimitBytes: 1 * 1024 * 1024 },
      ),
    ).rejects.toBeInstanceOf(TransformMemoryError);
  });

  it("does not expose network or filesystem globals", async () => {
    const value = await evaluateTransform(
      "export default function () { return [typeof fetch, typeof require, typeof process, typeof setTimeout]; }",
      {},
    );
    expect(value).toEqual(["undefined", "undefined", "undefined", "undefined"]);
  });

  it("filters null results, fans out, and preserves body override bytes", () => {
    expect(validateTransformResult(null)).toEqual({ kind: "drop" });
    const destinations = resolveTransformDestinations(
      validateTransformResult({ destinations: ["billing", "analytics"] }).kind === "deliver"
        ? ["billing", "analytics"]
        : undefined,
      new Map([["billing", {}], ["analytics", {}]]),
    );
    expect(destinations).toEqual(["billing", "analytics"]);
    expect(serializeTransformBody({ id: "inv_123", amount: 99 }).toString()).toBe(
      '{"id":"inv_123","amount":99}',
    );
  });
});
