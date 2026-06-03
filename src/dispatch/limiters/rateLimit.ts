interface Bucket {
  tokens: number;
  lastRefillAt: number;
}

export interface RateLimiterOptions {
  burst?: number;
  now?: () => number;
  sleep?: (durationMs: number) => Promise<void>;
}

export class DestinationRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly tails = new Map<string, Promise<void>>();
  private readonly now: () => number;
  private readonly sleep: (durationMs: number) => Promise<void>;
  private readonly burst: number;
  private readonly rates: ReadonlyMap<string, number>;

  constructor(rates: ReadonlyMap<string, number>, options: RateLimiterOptions = {}) {
    this.rates = rates;
    this.burst = options.burst ?? 0;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs)));

    for (const [destinationId, rps] of rates) {
      if (!(rps > 0) || !Number.isFinite(rps)) {
        throw new Error(`rate limit for ${destinationId} must be positive`);
      }
    }
  }

  take(destinationId: string): Promise<void> {
    if (!this.rates.has(destinationId)) throw new Error(`Unknown destination: ${destinationId}`);
    const previous = this.tails.get(destinationId) ?? Promise.resolve();
    const operation = previous.then(() => this.consume(destinationId));
    this.tails.set(destinationId, operation.catch(() => undefined));
    return operation;
  }

  private async consume(destinationId: string): Promise<void> {
    const rps = this.rates.get(destinationId)!;
    const capacity = this.burst > 0 ? this.burst : Math.max(1, Math.ceil(rps));
    let bucket = this.buckets.get(destinationId);
    if (!bucket) {
      bucket = { tokens: capacity, lastRefillAt: this.now() };
      this.buckets.set(destinationId, bucket);
    }

    while (bucket.tokens < 1) {
      const elapsedMs = Math.max(0, this.now() - bucket.lastRefillAt);
      bucket.tokens = Math.min(capacity, bucket.tokens + (elapsedMs / 1_000) * rps);
      bucket.lastRefillAt = this.now();
      if (bucket.tokens >= 1) break;
      await this.sleep(((1 - bucket.tokens) / rps) * 1_000);
    }

    bucket.tokens -= 1;
  }
}
