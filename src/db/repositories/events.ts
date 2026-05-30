import { query } from "../pool.js";

const INSERT_EVENT_SQL = `INSERT INTO events (source_id, dedup_key, raw_body, headers)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (source_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING
     RETURNING id`;

export async function insertEvent(input: {
  sourceId: string;
  dedupKey: string | null;
  rawBody: Buffer;
  headers: Record<string, string>;
}): Promise<number | null> {
  const result = await query<{ id: string }>(
    INSERT_EVENT_SQL,
    [input.sourceId, input.dedupKey, input.rawBody, JSON.stringify(input.headers)],
  );

  return result.rows[0] ? Number(result.rows[0].id) : null;
}

export async function markSucceeded(eventId: string | number): Promise<void> {
  await query(
    `UPDATE events
     SET status = 'succeeded', locked_at = NULL, completed_at = now()
     WHERE id = $1 AND status = 'running'`,
    [eventId],
  );
}
