import type { PoolClient } from "pg";

import { query } from "../pool.js";

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
}

export async function insertDeliveries(
  client: PoolClient,
  eventId: string | number,
  destinationIds: string[],
  body: Buffer | null = null,
): Promise<void> {
  for (const destinationId of destinationIds) {
    await client.query(
      "INSERT INTO deliveries (event_id, destination_id, body) VALUES ($1, $2, $3)",
      [eventId, destinationId, body],
    );
  }
}

export async function createDeliveries(
  eventId: string | number,
  destinationIds: string[],
  body: Buffer | null = null,
): Promise<void> {
  for (const destinationId of destinationIds) {
    await query(
      "INSERT INTO deliveries (event_id, destination_id, body) VALUES ($1, $2, $3)",
      [eventId, destinationId, body],
    );
  }
}

export function validateDeliveryDestinations(
  destinationIds: string[],
  configured: ReadonlyMap<string, unknown>,
): void {
  for (const destinationId of destinationIds) {
    if (!configured.has(destinationId)) {
      throw new Error(`Unknown destination: ${destinationId}`);
    }
  }
}

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
     SELECT claimed.*, events.source_id, events.raw_body, events.headers
     FROM claimed
     JOIN events ON events.id = claimed.event_id
     ORDER BY claimed.next_retry_at, claimed.delivery_id`,
    [batchSize],
  );

  return result.rows;
}

export async function markSucceeded(deliveryId: string | number): Promise<void> {
  await query(
    `UPDATE deliveries
     SET status = 'succeeded', locked_at = NULL, completed_at = now()
     WHERE id = $1 AND status = 'running'`,
    [deliveryId],
  );
}

export async function scheduleRetry(deliveryId: string | number, delayMs: number): Promise<void> {
  await query(
    `UPDATE deliveries
     SET status = 'pending',
         next_retry_at = now() + ($2 * interval '1 millisecond'),
         locked_at = NULL
     WHERE id = $1 AND status = 'running'`,
    [deliveryId, delayMs],
  );
}

export async function markDead(deliveryId: string | number, failedReason: string): Promise<void> {
  await query(
    `UPDATE deliveries
     SET status = 'dead', failed_reason = $2, locked_at = NULL
     WHERE id = $1 AND status = 'running'`,
    [deliveryId, failedReason],
  );
}
