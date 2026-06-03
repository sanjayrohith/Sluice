import { describe, expect, it } from "vitest";

import { DestinationRateLimiter } from "../../src/dispatch/limiters/rateLimit.js";

describe("DestinationRateLimiter", () => {
  it("allows the configured burst and delays subsequent tokens", async () => {
    let clock = 0;
    const sleeps: number[] = [];
    const limiter = new DestinationRateLimiter(new Map([["target", 10]]), {
      burst: 2,
      now: () => clock,
      sleep: async (durationMs) => {
        sleeps.push(durationMs);
        clock += durationMs;
      },
    });

    await limiter.take("target");
    await limiter.take("target");
    await limiter.take("target");

    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toBe(100);
  });

  it("keeps buckets independent by destination", async () => {
    const limiter = new DestinationRateLimiter(new Map([["a", 1], ["b", 1]]), { burst: 1 });
    await limiter.take("a");
    await limiter.take("b");
  });
});
