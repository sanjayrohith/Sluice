import { describe, expect, it } from "vitest";

import { shouldDeadLetter } from "../../src/dispatch/worker.js";

describe("dead letter routing", () => {
  it("dead-letters a permanent 400-style outcome immediately", () => {
    expect(shouldDeadLetter(["permanent"], 1, 12)).toBe(true);
  });

  it("keeps retryable failures pending until the max attempt", () => {
    expect(shouldDeadLetter(["retryable"], 11, 12)).toBe(false);
    expect(shouldDeadLetter(["retryable"], 12, 12)).toBe(true);
  });
});
