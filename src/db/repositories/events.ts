import { query, withTransaction } from "../pool.js";
import { insertDeliveries } from "./deliveries.js";

export async function insertEvent(input: {
  sourceId: string;
  dedupKey: string | null;
  rawBody: Buffer;
  headers: Record<string, string>;
}): Promise<number | null> {
  return insertEventWithDeliveries(input, []);
}

export async function insertEventWithDeliveries(
  input: {
    sourceId: string;
    dedupKey: string | null;
    rawBody: Buffer;
    headers: Record<string, string>;
  },
  destinationIds: string[],
): Promise<number | null> {
  return withTransaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO events (source_id, dedup_key, raw_body, headers)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (source_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING
       RETURNING id`,
      [input.sourceId, input.dedupKey, input.rawBody, JSON.stringify(input.headers)],
    );

    const eventId = result.rows[0] ? Number(result.rows[0].id) : null;
    if (eventId !== null) {
      await insertDeliveries(client, eventId, destinationIds);
    }
    return eventId;
  });
}

export async function markSucceeded(eventId: string | number): Promise<void> {
  await query(
    `UPDATE events
     SET status = 'succeeded', locked_at = NULL, completed_at = now()
     WHERE id = $1 AND status = 'running'`,
    [eventId],
  );
}

export const markCompleted = markSucceeded;

export async function scheduleRetry(eventId: string | number, delayMs: number): Promise<void> {
  await query(
    `UPDATE events
     SET status = 'pending',
         next_retry_at = now() + ($2 * interval '1 millisecond'),
         locked_at = NULL
     WHERE id = $1 AND status = 'running'`,
    [eventId, delayMs],
  );
}

export async function markDead(eventId: string | number, failedReason: string): Promise<void> {
  await query(
    `UPDATE events
     SET status = 'dead', failed_reason = $2, locked_at = NULL
     WHERE id = $1 AND status = 'running'`,
    [eventId, failedReason],
  );
}

export async function markFiltered(eventId: string | number): Promise<void> {
  await query(
    `UPDATE events
     SET status = 'filtered', failed_reason = NULL, locked_at = NULL
     WHERE id = $1 AND status = 'pending'`,
    [eventId],
  );
}

export async function markQuarantined(
  eventId: string | number,
  failedReason: string,
): Promise<void> {
  await query(
    `UPDATE events
     SET status = 'quarantined', failed_reason = $2, locked_at = NULL
     WHERE id = $1 AND status = 'pending'`,
    [eventId, failedReason],
  );
}


export async function syncEventStatus(eventId: string | number): Promise<string | null> {
  const result = await query<{ status: string }>(
    "SELECT status FROM deliveries WHERE event_id = $1",
    [eventId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const statuses = result.rows.map((row) => row.status);
  const allSucceeded = statuses.every((status) => status === "succeeded");
  const nonePendingOrRunning = statuses.every(
    (status) => status !== "pending" && status !== "running",
  );

  if (allSucceeded) {
    await query(
      `UPDATE events
       SET status = 'succeeded', completed_at = now(), locked_at = NULL
       WHERE id = $1`,
      [eventId],
    );
    return "succeeded";
  }

  if (nonePendingOrRunning) {
    await query(
      `UPDATE events
       SET status = 'dead', failed_reason = 'deliveries_failed', locked_at = NULL
       WHERE id = $1`,
      [eventId],
    );
    return "dead";
  }

  return "pending";
}
