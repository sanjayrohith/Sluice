import { loadEnv } from "../config/env.js";
import type { SourcesConfig } from "../config/sources.js";
import { query } from "../db/pool.js";
import { markSucceeded, scheduleRetry } from "../db/repositories/events.js";
import { buildForwardedHeaders, deliver } from "./deliver.js";
import { claimEvents, type ClaimedEvent } from "./claim.js";
import { createDestinationResolver } from "./destinations.js";
import { calculateBackoff } from "./backoff.js";
import { classifyOutcome } from "./outcome.js";

export interface WorkerOptions {
  sourcesConfig: SourcesConfig;
  batchSize?: number;
  pollIntervalMs?: number;
  maxAttempts?: number;
  backoffBaseMs?: number;
  backoffCapMs?: number;
  claim?: (batchSize: number) => Promise<ClaimedEvent[]>;
  deliver?: typeof deliver;
}

export class DispatcherWorker {
  private stopping = false;
  private wakeWaiter: (() => void) | undefined;
  private readonly resolveDestination;
  private readonly sourcesConfig: SourcesConfig;
  private readonly options: Required<
    Pick<WorkerOptions, "batchSize" | "pollIntervalMs" | "maxAttempts" | "backoffBaseMs" | "backoffCapMs">
  >;
  private readonly claim;
  private readonly send;

  constructor(options: WorkerOptions) {
    this.sourcesConfig = options.sourcesConfig;
    this.resolveDestination = createDestinationResolver(options.sourcesConfig);
    this.options = {
      batchSize: options.batchSize ?? 20,
      pollIntervalMs: options.pollIntervalMs ?? 1_000,
      maxAttempts: options.maxAttempts ?? 12,
      backoffBaseMs: options.backoffBaseMs ?? 5_000,
      backoffCapMs: options.backoffCapMs ?? 6 * 60 * 60 * 1_000,
    };
    this.claim = options.claim ?? claimEvents;
    this.send = options.deliver ?? deliver;
  }

  async run(): Promise<void> {
    while (!this.stopping) {
      const events = await this.claim(this.options.batchSize);
      if (events.length === 0) {
        await this.waitForWork();
        continue;
      }

      for (const event of events) {
        await this.processEvent(event);
      }
    }
  }

  stop(): void {
    this.stopping = true;
    this.wakeWaiter?.();
    this.wakeWaiter = undefined;
  }

  private async processEvent(event: ClaimedEvent): Promise<void> {
    const source = this.resolveSource(event.source_id);
    const results = [];

    for (const destinationId of source.destinations) {
      const destination = this.resolveDestination(destinationId);
      results.push(
        await this.send({
          url: destination.url,
          body: event.raw_body,
          headers: buildForwardedHeaders(event.headers, {
            eventId: event.id,
            attempt: event.attempts,
            source: event.source_id,
          }),
        }),
      );
    }

    const outcomes = results.map(classifyOutcome);
    const succeeded = outcomes.every((outcome) => outcome === "success");
    if (succeeded) {
      await markSucceeded(event.id);
    } else if (
      outcomes.some((outcome) => outcome === "retryable") &&
      event.attempts < this.options.maxAttempts
    ) {
      await scheduleRetry(
        event.id,
        calculateBackoff(event.attempts, {
          baseMs: this.options.backoffBaseMs,
          capMs: this.options.backoffCapMs,
        }),
      );
    } else {
      await query(
        "UPDATE events SET status = 'pending', locked_at = NULL WHERE id = $1 AND status = 'running'",
        [event.id],
      );
    }
  }

  private resolveSource(sourceId: string) {
    const source = [...this.sourcesConfig.sources.values()].find(
      (candidate) => candidate.id === sourceId,
    );
    if (!source) {
      throw new Error(`Unknown source: ${sourceId}`);
    }
    return source;
  }

  private waitForWork(): Promise<void> {
    if (this.stopping) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.wakeWaiter = undefined;
        resolve();
      }, this.options.pollIntervalMs);
      this.wakeWaiter = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }
}

export async function runWorker(sourcesConfig: SourcesConfig): Promise<void> {
  const env = loadEnv();
  const worker = new DispatcherWorker({
    sourcesConfig,
    batchSize: env.DISPATCH_BATCH_SIZE,
    pollIntervalMs: env.POLL_INTERVAL_MS,
    maxAttempts: env.MAX_ATTEMPTS,
    backoffBaseMs: env.BACKOFF_BASE_MS,
    backoffCapMs: env.BACKOFF_CAP_MS,
  });
  await worker.run();
}
