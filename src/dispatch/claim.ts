import { query } from "../db/pool.js";

export interface ClaimedEvent {
  id: string;
  source_id: string;
  dedup_key: string | null;
  raw_body: Buffer;
  headers: Record<string, string>;
  status: string;
  attempts: number;
  next_retry_at: Date;
  locked_at: Date;
  created_at: Date;
}

export async function claimEvents(batchSize = 20): Promise<ClaimedEvent[]> {
  const result = await query<ClaimedEvent>(
    `WITH candidates AS (
       SELECT id
       FROM events
       WHERE status = 'pending' AND next_retry_at <= now()
       ORDER BY next_retry_at, id
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     ), claimed AS (
       UPDATE events AS events
       SET status = 'running', locked_at = now(), attempts = events.attempts + 1
       FROM candidates
       WHERE events.id = candidates.id
       RETURNING events.*
     )
     SELECT *
     FROM claimed
     ORDER BY next_retry_at, id`,
    [batchSize],
  );

  return result.rows;
}
