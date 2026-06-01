import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pool, query } from "../../src/db/pool.js";
import { recordAttempt, truncateResponseBody } from "../../src/db/repositories/attempts.js";
import { runMigrations } from "../../src/db/migrate.js";

const runDatabaseTests = process.env.RUN_DB_TESTS === "1";

describe("attempt logging", () => {
  it("truncates response bodies at 64 KiB", () => {
    const response = truncateResponseBody("x".repeat(70 * 1024));
    expect(response).toHaveLength(64 * 1024);
  });
});

describe.skipIf(!runDatabaseTests)("attempt logging database integration", () => {
  let eventId: string;

  beforeAll(async () => {
    await runMigrations();
    const event = await query<{ id: string }>(
      "INSERT INTO events (source_id, raw_body, headers) VALUES ($1, $2, $3::jsonb) RETURNING id",
      ["attempt-test", Buffer.from("{}"), "{}"],
    );
    eventId = event.rows[0]!.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("records each retry and preserves network errors", async () => {
    for (const attemptNumber of [1, 2, 3]) {
      await recordAttempt({
        eventId,
        attemptNumber,
        destinationId: "target",
        requestHeaders: { "x-sluice-attempt": String(attemptNumber) },
        responseStatus: attemptNumber === 3 ? 0 : 500,
        responseHeaders: {},
        responseBody: attemptNumber === 3 ? "" : `failure-${attemptNumber}`,
        durationMs: attemptNumber * 10,
        error: attemptNumber === 3 ? "connect ECONNREFUSED" : undefined,
      });
    }

    const rows = await query<{ attempt_number: number; response_status: number; error: string | null }>(
      "SELECT attempt_number, response_status, error FROM delivery_attempts WHERE event_id = $1 ORDER BY attempt_number",
      [eventId],
    );
    expect(rows.rows).toEqual([
      { attempt_number: 1, response_status: 500, error: null },
      { attempt_number: 2, response_status: 500, error: null },
      { attempt_number: 3, response_status: 0, error: "connect ECONNREFUSED" },
    ]);
  });
});
