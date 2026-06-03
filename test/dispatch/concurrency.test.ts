import { describe, expect, it } from "vitest";

import { DestinationConcurrencyLimiter } from "../../src/dispatch/limiters/concurrency.js";

describe("DestinationConcurrencyLimiter", () => {
  it("enforces independent per-destination ceilings", async () => {
    const limiter = new DestinationConcurrencyLimiter(
      new Map([
        ["small", 1],
        ["large", 2],
      ]),
    );
    const first = await limiter.acquire("small");
    let acquired = false;
    const waiting = limiter.acquire("small").then((release) => {
      acquired = true;
      release();
    });

    await Promise.resolve();
    expect(acquired).toBe(false);
    first();
    await waiting;
    expect(acquired).toBe(true);
  });

  it("does not let a release be consumed twice", async () => {
    const limiter = new DestinationConcurrencyLimiter(new Map([["target", 1]]));
    const release = await limiter.acquire("target");
    release();
    release();
    const second = await limiter.acquire("target");
    second();
  });
});
