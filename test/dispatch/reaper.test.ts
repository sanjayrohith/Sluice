import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { pool, query } from "../../src/db/pool.js";
import { reapStaleDeliveries, reapStaleEvents } from "../../src/dispatch/reaper.js";
import { createScratchSchema } from "../helpers/db.js";

const runDatabaseTests = process.env.RUN_DB_TESTS === "1";

describe.skipIf(!runDatabaseTests)("background reaper recovery", () => {
  beforeAll(async () => {
    await createScratchSchema();
  });

  beforeEach(async () => {
    await query("TRUNCATE events, rejected_events, deliveries RESTART IDENTITY CASCADE");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("reclaims stranded deliveries locked by crashed workers", async () => {
    const event = await query<{ id: string }>(
      `INSERT INTO events (source_id, raw_body, headers)
       VALUES ('github', $1, '{}'::jsonb) RETURNING id`,
      [Buffer.from("payload")],
    );
    const eventId = event.rows[0]!.id;

    // Stranded delivery: locked 10 minutes ago
    await query(
      `INSERT INTO deliveries (event_id, destination_id, status, locked_at)
       VALUES ($1, 'target-a', 'running', now() - interval '10 minutes')`,
      [eventId],
    );

    // Active delivery: locked 10 seconds ago
    await query(
      `INSERT INTO deliveries (event_id, destination_id, status, locked_at)
       VALUES ($1, 'target-b', 'running', now() - interval '10 seconds')`,
      [eventId],
    );

    // Reaping with 5-minute timeout (300,000 ms)
    const reapedCount = await reapStaleDeliveries(5 * 60 * 1_000);
    expect(reapedCount).toBe(1);

    const reapedResult = await query<{ status: string; locked_at: string | null }>(
      "SELECT status, locked_at FROM deliveries WHERE destination_id = $1",
      ["target-a"],
    );
    expect(reapedResult.rows[0].status).toBe("pending");
    expect(reapedResult.rows[0].locked_at).toBeNull();

    const activeResult = await query<{ status: string; locked_at: string | null }>(
      "SELECT status, locked_at FROM deliveries WHERE destination_id = $1",
      ["target-b"],
    );
    expect(activeResult.rows[0].status).toBe("running");
    expect(activeResult.rows[0].locked_at).not.toBeNull();
  });

  it("does not touch deliveries in completed, dead, or pending state", async () => {
    const event = await query<{ id: string }>(
      `INSERT INTO events (source_id, raw_body, headers)
       VALUES ('github', $1, '{}'::jsonb) RETURNING id`,
      [Buffer.from("payload")],
    );
    const eventId = event.rows[0]!.id;

    await query(
      `INSERT INTO deliveries (event_id, destination_id, status, locked_at)
       VALUES
         ($1, 'dest-1', 'succeeded', now() - interval '10 minutes'),
         ($1, 'dest-2', 'dead', now() - interval '10 minutes'),
         ($1, 'dest-3', 'pending', NULL)`,
      [eventId],
    );

    const reapedCount = await reapStaleEvents(5 * 60 * 1_000);
    expect(reapedCount).toBe(0);
  });
});
