import { loadEnv } from "../config/env.js";
import type { SourcesConfig } from "../config/sources.js";
import { markDead, markSucceeded, scheduleRetry } from "../db/repositories/deliveries.js";
import { syncEventStatus } from "../db/repositories/events.js";
import { recordAttempt } from "../db/repositories/attempts.js";
import { buildForwardedHeaders, deliver, type DeliveryResult } from "./deliver.js";
import { claimDeliveries, type ClaimedDelivery } from "./claim.js";
import { createDestinationResolver } from "./destinations.js";
import { calculateBackoff, retryAfterDelayMs } from "./backoff.js";
import { classifyOutcome } from "./outcome.js";
import { reapStaleEvents } from "./reaper.js";
import { DestinationConcurrencyLimiter } from "./limiters/concurrency.js";
import { DestinationRateLimiter } from "./limiters/rateLimit.js";
import { withDeliverySpan } from "../otel/propagation.js";
import {
  annotateDeliverySpan,
  deliverySpanAttributes,
} from "../otel/attributes.js";

export interface WorkerOptions {
  sourcesConfig: SourcesConfig;
  batchSize?: number;
  pollIntervalMs?: number;
  maxAttempts?: number;
  backoffBaseMs?: number;
  backoffCapMs?: number;
  lockTimeoutMs?: number;
  claim?: (batchSize: number) => Promise<ClaimedDelivery[]>;
  deliver?: typeof deliver;
  syncEventStatus?: typeof syncEventStatus;
}

export function shouldDeadLetter(
  outcomes: Array<"success" | "retryable" | "permanent">,
  attempts: number,
  maxAttempts: number,
): boolean {
  return (
    outcomes.some((outcome) => outcome === "permanent") ||
    (outcomes.some((outcome) => outcome === "retryable") && attempts >= maxAttempts)
  );
}

export class DispatcherWorker {
  private stopping = false;
  private wakeWaiter: (() => void) | undefined;
  private readonly resolveDestination;
  private readonly sourcesConfig: SourcesConfig;
  private readonly options: Required<
    Pick<
      WorkerOptions,
      "batchSize" | "pollIntervalMs" | "maxAttempts" | "backoffBaseMs" | "backoffCapMs" | "lockTimeoutMs"
    >
  >;
  private readonly claim: (batchSize: number) => Promise<ClaimedDelivery[]>;
  private readonly send;
  private readonly syncStatus: typeof syncEventStatus;
  private readonly concurrencyLimiter: DestinationConcurrencyLimiter;
  private readonly rateLimiter: DestinationRateLimiter;

  constructor(options: WorkerOptions) {
    this.sourcesConfig = options.sourcesConfig;
    this.resolveDestination = createDestinationResolver(options.sourcesConfig);
    this.options = {
      batchSize: options.batchSize ?? 20,
      pollIntervalMs: options.pollIntervalMs ?? 1_000,
      maxAttempts: options.maxAttempts ?? 12,
      backoffBaseMs: options.backoffBaseMs ?? 5_000,
      backoffCapMs: options.backoffCapMs ?? 6 * 60 * 60 * 1_000,
      lockTimeoutMs: options.lockTimeoutMs ?? 5 * 60 * 1_000,
    };
    this.claim = options.claim ?? claimDeliveries;
    this.send = options.deliver ?? deliver;
    this.syncStatus = options.syncEventStatus ?? syncEventStatus;
    this.concurrencyLimiter = new DestinationConcurrencyLimiter(
      new Map(
        [...options.sourcesConfig.destinations].map(([id, destination]) => [id, destination.concurrency]),
      ),
    );
    this.rateLimiter = new DestinationRateLimiter(
      new Map([...options.sourcesConfig.destinations].map(([id, destination]) => [id, destination.rps])),
    );
  }

  async run(): Promise<void> {
    const reaperInterval = setInterval(
      () => void reapStaleEvents(this.options.lockTimeoutMs),
      Math.max(1_000, Math.floor(this.options.lockTimeoutMs / 2)),
    );

    try {
      while (!this.stopping) {
        const events = await this.claim(this.options.batchSize);
        if (events.length === 0) {
          await this.waitForWork();
          continue;
        }

        await Promise.all(events.map((event) => this.processEvent(event)));
      }
    } finally {
      clearInterval(reaperInterval);
    }
  }

  stop(): void {
    this.stopping = true;
    this.wakeWaiter?.();
    this.wakeWaiter = undefined;
  }

  private async processEvent(event: ClaimedDelivery): Promise<void> {
    await withDeliverySpan(
      {
        traceparent: event.traceparent ?? undefined,
        tracestate: event.tracestate ?? undefined,
      },
      deliverySpanAttributes({
        eventId: event.event_id,
        sourceId: event.source_id,
        destinationId: event.destination_id,
        attempt: event.attempts,
      }),
      (span) => this.processEventInSpan(event, span),
    );
  }

  private async processEventInSpan(
    event: ClaimedDelivery,
    span: import("@opentelemetry/api").Span,
  ): Promise<void> {
    const results = [await this.processDestination(event, event.destination_id)];
    annotateDeliverySpan(span, results[0]);

    const outcomes = results.map(classifyOutcome);
    const succeeded = outcomes.every((outcome) => outcome === "success");
    if (succeeded) {
      await markSucceeded(event.delivery_id);
      await this.syncStatus(event.event_id);
    } else if (shouldDeadLetter(outcomes, event.attempts, this.options.maxAttempts)) {
      const permanentIndex = outcomes.indexOf("permanent");
      const deadResult = permanentIndex >= 0 ? results[permanentIndex] : results[0];
      await markDead(event.delivery_id, failureReason(deadResult));
      await this.syncStatus(event.event_id);
    } else if (
      outcomes.some((outcome) => outcome === "retryable") &&
      event.attempts < this.options.maxAttempts
    ) {
      const retryAfter = results
        .filter((result) => result.status === 429 || result.status === 503)
        .map((result) => retryAfterDelayMs(result.headers, Date.now(), this.options.backoffCapMs))
        .find((delay) => delay !== null);
      await scheduleRetry(
        event.delivery_id,
        retryAfter ??
          calculateBackoff(event.attempts, {
            baseMs: this.options.backoffBaseMs,
            capMs: this.options.backoffCapMs,
          }),
      );
    } else {
      await markDead(event.delivery_id, failureReason(results[0]));
      await this.syncStatus(event.event_id);
    }
  }

  private async processDestination(event: ClaimedDelivery, destinationId: string): Promise<DeliveryResult> {
    await this.rateLimiter.take(destinationId);
    const release = await this.concurrencyLimiter.acquire(destinationId);
    try {
      const destination = this.resolveDestination(destinationId);
      const requestHeaders = buildForwardedHeaders(event.headers, {
        eventId: event.event_id,
        attempt: event.attempts,
        source: event.source_id,
      });
      const result = await this.send({
        url: destination.url,
        body: event.body ?? event.raw_body,
        headers: requestHeaders,
        timeoutMs: destination.timeout_ms,
      });
      await recordAttempt({
        eventId: event.event_id,
        deliveryId: event.delivery_id,
        attemptNumber: event.attempts,
        destinationId,
        requestHeaders,
        responseStatus: result.status,
        responseHeaders: result.headers,
        responseBody: result.bodySnippet,
        durationMs: result.durationMs,
        error: result.error,
      });
      return result;
    } finally {
      release();
    }
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

function failureReason(result?: { status: number; error?: string }): string {
  if (!result) return "unknown";
  if (result.error) return result.error;
  return `http_${result.status}`;
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
    lockTimeoutMs: env.LOCK_TIMEOUT_MS,
  });
  await worker.run();
}
