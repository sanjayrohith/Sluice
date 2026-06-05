import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { pool, query } from "../../src/db/pool.js";
import { runMigrations } from "../../src/db/migrate.js";
import { syncEventStatus } from "../../src/db/repositories/events.js";
import { parseSourcesConfig } from "../../src/config/sources.js";
import { DispatcherWorker } from "../../src/dispatch/worker.js";
import type { ClaimedDelivery } from "../../src/dispatch/claim.js";
import * as deliveriesRepo from "../../src/db/repositories/deliveries.js";
import * as attemptsRepo from "../../src/db/repositories/attempts.js";

const runDatabaseTests = process.env.RUN_DB_TESTS === "1";

describe("parent event status aggregation across destinations", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("unit status aggregation logic", () => {
    it("returns null when no deliveries exist for event", async () => {
      vi.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: "SELECT",
        oid: 0,
        fields: [],
      });

      const status = await syncEventStatus("123");
      expect(status).toBeNull();
    });

    it("marks parent event succeeded when all destination deliveries succeed", async () => {
      const querySpy = vi.spyOn(pool, "query")
        .mockResolvedValueOnce({
          rows: [{ status: "succeeded" }, { status: "succeeded" }],
          rowCount: 2,
          command: "SELECT",
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
          command: "UPDATE",
          oid: 0,
          fields: [],
        });

      const status = await syncEventStatus("100");
      expect(status).toBe("succeeded");
      expect(querySpy).toHaveBeenCalledTimes(2);
      expect(querySpy.mock.calls[1][0]).toContain("SET status = 'succeeded'");
    });

    it("keeps parent event pending when some deliveries are still pending retry", async () => {
      const querySpy = vi.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [{ status: "succeeded" }, { status: "pending" }],
        rowCount: 2,
        command: "SELECT",
        oid: 0,
        fields: [],
      });

      const status = await syncEventStatus("101");
      expect(status).toBe("pending");
      expect(querySpy).toHaveBeenCalledTimes(1); // No UPDATE query executed
    });

    it("keeps parent event pending when a delivery is still running", async () => {
      const querySpy = vi.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [{ status: "succeeded" }, { status: "running" }],
        rowCount: 2,
        command: "SELECT",
        oid: 0,
        fields: [],
      });

      const status = await syncEventStatus("102");
      expect(status).toBe("pending");
      expect(querySpy).toHaveBeenCalledTimes(1);
    });

    it("marks parent event dead when all destination deliveries are dead", async () => {
      const querySpy = vi.spyOn(pool, "query")
        .mockResolvedValueOnce({
          rows: [{ status: "dead" }, { status: "dead" }],
          rowCount: 2,
          command: "SELECT",
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
          command: "UPDATE",
          oid: 0,
          fields: [],
        });

      const status = await syncEventStatus("103");
      expect(status).toBe("dead");
      expect(querySpy).toHaveBeenCalledTimes(2);
      expect(querySpy.mock.calls[1][0]).toContain("SET status = 'dead'");
    });

    it("marks parent event dead when deliveries are terminal and at least one is dead", async () => {
      const querySpy = vi.spyOn(pool, "query")
        .mockResolvedValueOnce({
          rows: [{ status: "succeeded" }, { status: "dead" }],
          rowCount: 2,
          command: "SELECT",
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
          command: "UPDATE",
          oid: 0,
          fields: [],
        });

      const status = await syncEventStatus("104");
      expect(status).toBe("dead");
      expect(querySpy).toHaveBeenCalledTimes(2);
      expect(querySpy.mock.calls[1][0]).toContain("SET status = 'dead'");
    });
  });

  describe("dispatcher integration with event status sync", () => {
    const sourcesConfig = parseSourcesConfig({
      sources: [
        {
          id: "github",
          provider: "github",
          secret_env: "GITHUB_SECRET",
          destinations: ["target-1", "target-2"],
        },
      ],
      destinations: [
        { id: "target-1", url: "https://t1.example.com" },
        { id: "target-2", url: "https://t2.example.com" },
      ],
    });

    it("synchronizes parent event status when deliveries finish", async () => {
      vi.spyOn(deliveriesRepo, "markSucceeded").mockResolvedValue();
      vi.spyOn(attemptsRepo, "recordAttempt").mockResolvedValue();
      const syncSpy = vi.fn().mockResolvedValue("succeeded");

      const delivery1: ClaimedDelivery = {
        delivery_id: "del-1",
        event_id: "event-99",
        destination_id: "target-1",
        body: null,
        status: "running",
        attempts: 1,
        next_retry_at: new Date(),
        locked_at: new Date(),
        created_at: new Date(),
        source_id: "github",
        raw_body: Buffer.from("{}"),
        headers: {},
      };

      let claimed = false;
      const worker = new DispatcherWorker({
        sourcesConfig,
        syncEventStatus: syncSpy,
        claim: async () => {
          if (!claimed) {
            claimed = true;
            return [delivery1];
          }
          worker.stop();
          return [];
        },
        deliver: async () => ({ status: 200, headers: {}, bodySnippet: "ok", durationMs: 5 }),
      });

      await worker.run();
      expect(syncSpy).toHaveBeenCalledTimes(1);
      expect(syncSpy).toHaveBeenCalledWith("event-99");
    });
  });

  describe.skipIf(!runDatabaseTests)("database integration", () => {
    let testEventId: string;

    beforeAll(async () => {
      await runMigrations();
      const ev = await query<{ id: string }>(
        "INSERT INTO events (source_id, raw_body, headers) VALUES ('stripe', $1, '{}'::jsonb) RETURNING id",
        [Buffer.from("{}")],
      );
      testEventId = ev.rows[0]!.id;
    });

    beforeEach(async () => {
      await query("DELETE FROM deliveries WHERE event_id = $1", [testEventId]);
      await query("UPDATE events SET status = 'pending', completed_at = NULL, failed_reason = NULL WHERE id = $1", [testEventId]);
    });

    afterAll(async () => {
      await pool.end();
    });

    it("transitions event to succeeded in postgres when all deliveries complete", async () => {
      await query(
        "INSERT INTO deliveries (event_id, destination_id, status) VALUES ($1, 'd1', 'succeeded'), ($1, 'd2', 'succeeded')",
        [testEventId],
      );

      const status = await syncEventStatus(testEventId);
      expect(status).toBe("succeeded");

      const ev = await query<{ status: string; completed_at: string | null }>(
        "SELECT status, completed_at FROM events WHERE id = $1",
        [testEventId],
      );
      expect(ev.rows[0]!.status).toBe("succeeded");
      expect(ev.rows[0]!.completed_at).not.toBeNull();
    });

    it("keeps event pending in postgres when one delivery is still pending", async () => {
      await query(
        "INSERT INTO deliveries (event_id, destination_id, status) VALUES ($1, 'd1', 'succeeded'), ($1, 'd2', 'pending')",
        [testEventId],
      );

      const status = await syncEventStatus(testEventId);
      expect(status).toBe("pending");

      const ev = await query<{ status: string }>("SELECT status FROM events WHERE id = $1", [testEventId]);
      expect(ev.rows[0]!.status).toBe("pending");
    });

    it("transitions event to dead in postgres when a delivery is dead and none pending", async () => {
      await query(
        "INSERT INTO deliveries (event_id, destination_id, status) VALUES ($1, 'd1', 'succeeded'), ($1, 'd2', 'dead')",
        [testEventId],
      );

      const status = await syncEventStatus(testEventId);
      expect(status).toBe("dead");

      const ev = await query<{ status: string; failed_reason: string | null }>(
        "SELECT status, failed_reason FROM events WHERE id = $1",
        [testEventId],
      );
      expect(ev.rows[0]!.status).toBe("dead");
      expect(ev.rows[0]!.failed_reason).toBe("deliveries_failed");
    });
  });
});
