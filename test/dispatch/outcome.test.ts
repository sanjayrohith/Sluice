import { describe, expect, it } from "vitest";

import { classifyOutcome } from "../../src/dispatch/outcome.js";
import { retryAfterDelayMs } from "../../src/dispatch/backoff.js";

const result = (status: number) => ({
  status,
  headers: {},
  bodySnippet: "",
  durationMs: 1,
});

describe("classifyOutcome", () => {
  it.each([200, 201, 204])("classifies %s as success", (status) => {
    expect(classifyOutcome(result(status))).toBe("success");
  });

  it.each([0, 408, 429, 500, 502, 599])("classifies %s as retryable", (status) => {
    expect(classifyOutcome(result(status))).toBe("retryable");
  });

  it.each([300, 400, 401, 404, 499])("classifies %s as permanent", (status) => {
    expect(classifyOutcome(result(status))).toBe("permanent");
  });
});

describe("retry-after header parsing and backoff override", () => {
  it("parses seconds and respects cap", () => {
    expect(retryAfterDelayMs({ "retry-after": "3" }, 0, 2_000)).toBe(2_000);
    expect(retryAfterDelayMs({ "retry-after": "120" }, 0)).toBe(120_000);
  });

  it("parses HTTP dates", () => {
    expect(retryAfterDelayMs({ "Retry-After": "Thu, 01 Jan 1970 00:00:05 GMT" }, 0)).toBe(5_000);
  });

  it("returns null for invalid or missing Retry-After header", () => {
    expect(retryAfterDelayMs({ "retry-after": "invalid" }, 0)).toBeNull();
    expect(retryAfterDelayMs({}, 0)).toBeNull();
  });
});
