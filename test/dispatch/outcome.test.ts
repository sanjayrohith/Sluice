import { describe, expect, it } from "vitest";

import { classifyOutcome } from "../../src/dispatch/outcome.js";

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
