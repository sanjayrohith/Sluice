import { query } from "../db/pool.js";

export interface ClaimedDelivery {
  delivery_id: string;
  event_id: string;
  destination_id: string;
  body: Buffer | null;
  status: string;
  attempts: number;
  next_retry_at: Date;
  locked_at: Date;
  created_at: Date;
  source_id: string;
  raw_body: Buffer;
  headers: Record<string, string>;
  traceparent: string | null;
  tracestate: string | null;
}

export type ClaimedEvent = ClaimedDelivery;

export async function claimDeliveries(batchSize = 20): Promise<ClaimedDelivery[]> {
  const result = await query<ClaimedDelivery>(
    `WITH candidates AS (
       SELECT id
       FROM deliveries
       WHERE status = 'pending' AND next_retry_at <= now()
       ORDER BY next_retry_at, id
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     ), claimed AS (
       UPDATE deliveries AS deliveries
       SET status = 'running', locked_at = now(), attempts = deliveries.attempts + 1
       FROM candidates
       WHERE deliveries.id = candidates.id
       RETURNING deliveries.id AS delivery_id, deliveries.event_id,
                 deliveries.destination_id, deliveries.body, deliveries.status,
                 deliveries.attempts, deliveries.next_retry_at,
                 deliveries.locked_at, deliveries.created_at
     )
     SELECT claimed.*, events.source_id, events.raw_body, events.headers,
            events.traceparent, events.tracestate
     FROM claimed
     JOIN events ON events.id = claimed.event_id
     ORDER BY claimed.next_retry_at, claimed.delivery_id`,
    [batchSize],
  );

  return result.rows;
}

export const claimEvents = claimDeliveries;
