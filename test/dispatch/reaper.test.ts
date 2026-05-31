import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { pool, query } from "../../src/db/pool.js";
import { reapStaleEvents } from "../../src/dispatch/reaper.js";
import { createScratchSchema } from "../helpers/db.js";

const runDatabaseTests = process.env.RUN_DB_TESTS === "1";

describe.skipIf(!runDatabaseTests)("background reaper recovery", () => {
  beforeAll(async () => {
    await createScratchSchema();
  });

  beforeEach(async () => {
    await query("TRUNCATE events, rejected_events RESTART IDENTITY");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("reclaims stranded events locked by crashed workers", async () => {
    // Stranded event: locked 10 minutes ago
    await query(
      `INSERT INTO events (source_id, raw_body, headers, status, locked_at)
       VALUES ('github', $1, '{}'::jsonb, 'running', now() - interval '10 minutes')`,
      [Buffer.from("stale")],
    );

    // Active event: locked 10 seconds ago
    await query(
      `INSERT INTO events (source_id, raw_body, headers, status, locked_at)
       VALUES ('github', $1, '{}'::jsonb, 'running', now() - interval '10 seconds')`,
      [Buffer.from("fresh")],
    );

    // Reaping with 5-minute timeout (300,000 ms)
    const reapedCount = await reapStaleEvents(5 * 60 * 1_000);
    expect(reapedCount).toBe(1);

    const reapedResult = await query<{ status: string; locked_at: string | null }>(
      "SELECT status, locked_at FROM events WHERE raw_body = $1",
      [Buffer.from("stale")],
    );
    expect(reapedResult.rows[0].status).toBe("pending");
    expect(reapedResult.rows[0].locked_at).toBeNull();

    const activeResult = await query<{ status: string; locked_at: string | null }>(
      "SELECT status, locked_at FROM events WHERE raw_body = $1",
      [Buffer.from("fresh")],
    );
    expect(activeResult.rows[0].status).toBe("running");
    expect(activeResult.rows[0].locked_at).not.toBeNull();
  });

  it("does not touch events in completed, dead, or pending state", async () => {
    await query(
      `INSERT INTO events (source_id, raw_body, headers, status, locked_at)
       VALUES
         ('github', $1, '{}'::jsonb, 'succeeded', now() - interval '10 minutes'),
         ('github', $2, '{}'::jsonb, 'dead', now() - interval '10 minutes'),
         ('github', $3, '{}'::jsonb, 'pending', NULL)`,
      [Buffer.from("succeeded"), Buffer.from("dead"), Buffer.from("pending")],
    );

    const reapedCount = await reapStaleEvents(5 * 60 * 1_000);
    expect(reapedCount).toBe(0);
  });
});
