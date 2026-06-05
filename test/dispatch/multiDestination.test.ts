import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseSourcesConfig } from "../../src/config/sources.js";
import { DispatcherWorker } from "../../src/dispatch/worker.js";
import type { ClaimedDelivery } from "../../src/dispatch/claim.js";
import * as deliveriesRepo from "../../src/db/repositories/deliveries.js";
import * as attemptsRepo from "../../src/db/repositories/attempts.js";
import * as eventsRepo from "../../src/db/repositories/events.js";

describe("multi-destination delivery lifecycle and retry independence", () => {
  const sourcesConfig = parseSourcesConfig({
    sources: [
      {
        id: "stripe",
        provider: "stripe",
        secret_env: "STRIPE_WEBHOOK_SECRET",
        destinations: ["dest-alpha", "dest-beta"],
      },
    ],
    destinations: [
      { id: "dest-alpha", url: "https://alpha.example.com/hook" },
      { id: "dest-beta", url: "https://beta.example.com/hook" },
    ],
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(attemptsRepo, "recordAttempt").mockResolvedValue();
    vi.spyOn(eventsRepo, "syncEventStatus").mockResolvedValue("pending");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles one succeeding destination and one retryable failing destination independently", async () => {
    const markSucceededSpy = vi.spyOn(deliveriesRepo, "markSucceeded").mockResolvedValue();
    const scheduleRetrySpy = vi.spyOn(deliveriesRepo, "scheduleRetry").mockResolvedValue();
    const markDeadSpy = vi.spyOn(deliveriesRepo, "markDead").mockResolvedValue();
    const recordAttemptSpy = vi.spyOn(attemptsRepo, "recordAttempt").mockResolvedValue();

    const deliveryAlpha: ClaimedDelivery = {
      delivery_id: "101",
      event_id: "50",
      destination_id: "dest-alpha",
      body: null,
      status: "running",
      attempts: 1,
      next_retry_at: new Date(),
      locked_at: new Date(),
      created_at: new Date(),
      source_id: "stripe",
      raw_body: Buffer.from('{"type":"payment_intent.succeeded"}'),
      headers: { "content-type": "application/json" },
    };

    const deliveryBeta: ClaimedDelivery = {
      delivery_id: "102",
      event_id: "50",
      destination_id: "dest-beta",
      body: null,
      status: "running",
      attempts: 1,
      next_retry_at: new Date(),
      locked_at: new Date(),
      created_at: new Date(),
      source_id: "stripe",
      raw_body: Buffer.from('{"type":"payment_intent.succeeded"}'),
      headers: { "content-type": "application/json" },
    };

    let claimed = false;
    const worker = new DispatcherWorker({
      sourcesConfig,
      claim: async () => {
        if (!claimed) {
          claimed = true;
          return [deliveryAlpha, deliveryBeta];
        }
        worker.stop();
        return [];
      },
      deliver: async ({ url }) => {
        if (url.includes("alpha")) {
          return { status: 200, headers: {}, bodySnippet: "ok", durationMs: 12 };
        }
        return { status: 503, headers: {}, bodySnippet: "service unavailable", durationMs: 25 };
      },
      backoffBaseMs: 1_000,
      backoffCapMs: 10_000,
      maxAttempts: 3,
    });

    await worker.run();

    // dest-alpha succeeded
    expect(markSucceededSpy).toHaveBeenCalledTimes(1);
    expect(markSucceededSpy).toHaveBeenCalledWith("101");

    // dest-beta failed with retryable error and was scheduled for retry
    expect(scheduleRetrySpy).toHaveBeenCalledTimes(1);
    expect(scheduleRetrySpy).toHaveBeenCalledWith("102", expect.any(Number));
    expect(markDeadSpy).not.toHaveBeenCalled();

    // Both attempts were recorded with their respective delivery IDs
    expect(recordAttemptSpy).toHaveBeenCalledTimes(2);
    expect(recordAttemptSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "50",
        deliveryId: "101",
        destinationId: "dest-alpha",
        responseStatus: 200,
      }),
    );
    expect(recordAttemptSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "50",
        deliveryId: "102",
        destinationId: "dest-beta",
        responseStatus: 503,
      }),
    );
  });

  it("advances backoff on subsequent retries for the failing destination only", async () => {
    const scheduleRetrySpy = vi.spyOn(deliveriesRepo, "scheduleRetry").mockResolvedValue();

    const deliveryBetaAttempt2: ClaimedDelivery = {
      delivery_id: "102",
      event_id: "50",
      destination_id: "dest-beta",
      body: null,
      status: "running",
      attempts: 2,
      next_retry_at: new Date(),
      locked_at: new Date(),
      created_at: new Date(),
      source_id: "stripe",
      raw_body: Buffer.from('{"type":"payment_intent.succeeded"}'),
      headers: { "content-type": "application/json" },
    };

    let claimed = false;
    const worker = new DispatcherWorker({
      sourcesConfig,
      claim: async () => {
        if (!claimed) {
          claimed = true;
          return [deliveryBetaAttempt2];
        }
        worker.stop();
        return [];
      },
      deliver: async () => ({ status: 500, headers: {}, bodySnippet: "error", durationMs: 10 }),
      backoffBaseMs: 1_000,
      backoffCapMs: 60_000,
      maxAttempts: 5,
    });

    await worker.run();

    expect(scheduleRetrySpy).toHaveBeenCalledTimes(1);
    const delay = scheduleRetrySpy.mock.calls[0][1];
    // With base=1000 and attempt=2: 1000 * 2^2 = 4000, with jitter [0.5, 1.0] -> range [2000, 4000]
    expect(delay).toBeGreaterThanOrEqual(2_000);
    expect(delay).toBeLessThanOrEqual(4_000);
  });

  it("dead-letters exhausted destination without affecting successful destination", async () => {
    const markDeadSpy = vi.spyOn(deliveriesRepo, "markDead").mockResolvedValue();
    const scheduleRetrySpy = vi.spyOn(deliveriesRepo, "scheduleRetry").mockResolvedValue();

    const deliveryBetaExhausted: ClaimedDelivery = {
      delivery_id: "102",
      event_id: "50",
      destination_id: "dest-beta",
      body: null,
      status: "running",
      attempts: 3,
      next_retry_at: new Date(),
      locked_at: new Date(),
      created_at: new Date(),
      source_id: "stripe",
      raw_body: Buffer.from('{"type":"payment_intent.succeeded"}'),
      headers: { "content-type": "application/json" },
    };

    let claimed = false;
    const worker = new DispatcherWorker({
      sourcesConfig,
      claim: async () => {
        if (!claimed) {
          claimed = true;
          return [deliveryBetaExhausted];
        }
        worker.stop();
        return [];
      },
      deliver: async () => ({ status: 500, headers: {}, bodySnippet: "error", durationMs: 10 }),
      maxAttempts: 3,
    });

    await worker.run();

    expect(markDeadSpy).toHaveBeenCalledTimes(1);
    expect(markDeadSpy).toHaveBeenCalledWith("102", "http_500");
    expect(scheduleRetrySpy).not.toHaveBeenCalled();
  });

  it("immediately dead-letters permanent 4xx failures on one destination while other succeeds", async () => {
    const markSucceededSpy = vi.spyOn(deliveriesRepo, "markSucceeded").mockResolvedValue();
    const markDeadSpy = vi.spyOn(deliveriesRepo, "markDead").mockResolvedValue();
    const scheduleRetrySpy = vi.spyOn(deliveriesRepo, "scheduleRetry").mockResolvedValue();

    const deliveryAlpha: ClaimedDelivery = {
      delivery_id: "201",
      event_id: "80",
      destination_id: "dest-alpha",
      body: null,
      status: "running",
      attempts: 1,
      next_retry_at: new Date(),
      locked_at: new Date(),
      created_at: new Date(),
      source_id: "stripe",
      raw_body: Buffer.from("{}"),
      headers: {},
    };

    const deliveryBetaPermanentFail: ClaimedDelivery = {
      delivery_id: "202",
      event_id: "80",
      destination_id: "dest-beta",
      body: null,
      status: "running",
      attempts: 1,
      next_retry_at: new Date(),
      locked_at: new Date(),
      created_at: new Date(),
      source_id: "stripe",
      raw_body: Buffer.from("{}"),
      headers: {},
    };

    let claimed = false;
    const worker = new DispatcherWorker({
      sourcesConfig,
      claim: async () => {
        if (!claimed) {
          claimed = true;
          return [deliveryAlpha, deliveryBetaPermanentFail];
        }
        worker.stop();
        return [];
      },
      deliver: async ({ url }) => {
        if (url.includes("alpha")) {
          return { status: 200, headers: {}, bodySnippet: "ok", durationMs: 10 };
        }
        return { status: 400, headers: {}, bodySnippet: "bad request", durationMs: 10 };
      },
      maxAttempts: 12,
    });

    await worker.run();

    expect(markSucceededSpy).toHaveBeenCalledWith("201");
    expect(markDeadSpy).toHaveBeenCalledWith("202", "http_400");
    expect(scheduleRetrySpy).not.toHaveBeenCalled();
  });
});
