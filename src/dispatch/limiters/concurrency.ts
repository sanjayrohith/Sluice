interface PermitWaiter {
  resolve: (release: () => void) => void;
}

class Semaphore {
  private available: number;
  private readonly waiters: PermitWaiter[] = [];

  constructor(limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error("concurrency limit must be a positive integer");
    }
    this.available = limit;
  }

  acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available -= 1;
      return Promise.resolve(this.releaseOnce());
    }

    return new Promise((resolve) => this.waiters.push({ resolve }));
  }

  private releaseOnce(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const waiter = this.waiters.shift();
      if (waiter) {
        waiter.resolve(this.releaseOnce());
      } else {
        this.available += 1;
      }
    };
  }
}

export class DestinationConcurrencyLimiter {
  private readonly semaphores = new Map<string, Semaphore>();

  constructor(limits: ReadonlyMap<string, number>) {
    for (const [destinationId, limit] of limits) {
      this.semaphores.set(destinationId, new Semaphore(limit));
    }
  }

  acquire(destinationId: string): Promise<() => void> {
    const semaphore = this.semaphores.get(destinationId);
    if (!semaphore) throw new Error(`Unknown destination: ${destinationId}`);
    return semaphore.acquire();
  }
}
