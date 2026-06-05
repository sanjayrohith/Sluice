import { query } from "../db/pool.js";

const DEFAULT_LOCK_TIMEOUT_MS = 5 * 60 * 1_000;

export async function reapStaleDeliveries(lockTimeoutMs = DEFAULT_LOCK_TIMEOUT_MS): Promise<number> {
  const result = await query(
    `UPDATE deliveries
     SET status = 'pending', locked_at = NULL, next_retry_at = now()
     WHERE status = 'running'
       AND locked_at < now() - ($1 * interval '1 millisecond')`,
    [lockTimeoutMs],
  );
  return result.rowCount ?? 0;
}

export const reapStaleEvents = reapStaleDeliveries;
