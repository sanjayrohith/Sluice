import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { deliver } from "../../src/dispatch/deliver.js";
import { DestinationConcurrencyLimiter } from "../../src/dispatch/limiters/concurrency.js";
import { DestinationRateLimiter } from "../../src/dispatch/limiters/rateLimit.js";
import { createTargetServer, type TargetServer } from "../helpers/targetServer.js";

describe("delivery backpressure", () => {
  let target: TargetServer;

  beforeAll(async () => {
    target = await createTargetServer();
  });

  afterAll(async () => {
    await target.close();
  });

  it("keeps a 50-request burst within a concurrency ceiling of four", async () => {
    const concurrency = new DestinationConcurrencyLimiter(new Map([["target", 4]]));
    const work = Array.from({ length: 50 }, async () => {
      const release = await concurrency.acquire("target");
      try {
        return await deliver({ url: target.url, body: Buffer.from("{}"), timeoutMs: 5_000 });
      } finally {
        release();
      }
    });

    await Promise.all(work);
    expect(target.getMaxInFlight()).toBeLessThanOrEqual(4);
  });

  it("spreads a 10 RPS burst over at least 4.9 seconds", async () => {
    target.arrivals.length = 0;
    const rate = new DestinationRateLimiter(new Map([["target", 10]]), { burst: 1 });
    await Promise.all(
      Array.from({ length: 50 }, async () => {
        await rate.take("target");
        await deliver({ url: target.url, body: Buffer.from("{}"), timeoutMs: 5_000 });
      }),
    );

    expect(target.arrivals).toHaveLength(50);
    expect(target.arrivals.at(-1)! - target.arrivals[0]!).toBeGreaterThanOrEqual(4_900);
  }, 15_000);
});
