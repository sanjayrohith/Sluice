import { describe, expect, it } from "vitest";

import { calculateBackoff } from "../../src/dispatch/backoff.js";

describe("calculateBackoff", () => {
  it("keeps jitter between 0.5x and 1x of the uncapped ideal", () => {
    const ideal = 5_000 * 2 ** 4;
    const low = calculateBackoff(4, { random: () => 0 });
    const high = calculateBackoff(4, { random: () => 0.999999 });

    expect(low).toBe(ideal * 0.5);
    expect(high).toBeLessThanOrEqual(ideal);
    expect(low).toBeGreaterThanOrEqual(ideal * 0.5);
  });

  it("never exceeds the cap", () => {
    expect(calculateBackoff(20, { random: () => 0.999999, capMs: 60_000 })).toBeLessThanOrEqual(60_000);
  });

  it("grows monotonically when the random factor is held constant", () => {
    const delays = Array.from({ length: 8 }, (_, attempts) =>
      calculateBackoff(attempts, { random: () => 0.5 }),
    );

    for (let index = 1; index < delays.length; index += 1) {
      expect(delays[index]).toBeGreaterThan(delays[index - 1]);
    }
  });

  it("spreads a thundering herd across different retry times", () => {
    let seed = 0x12345678;
    const values = Array.from({ length: 1_000 }, () => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 2 ** 32;
    }).map((random) => calculateBackoff(8, { random: () => random }));

    expect(new Set(values).size).toBeGreaterThan(900);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(5_000);
  });
});
