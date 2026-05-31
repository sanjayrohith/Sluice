import { query } from "../db/pool.js";

const DEFAULT_LOCK_TIMEOUT_MS = 5 * 60 * 1_000;

export async function reapStaleEvents(lockTimeoutMs = DEFAULT_LOCK_TIMEOUT_MS): Promise<number> {
  const result = await query(
    `UPDATE events
     SET status = 'pending', locked_at = NULL, next_retry_at = now()
     WHERE status = 'running'
       AND locked_at < now() - ($1 * interval '1 millisecond')`,
    [lockTimeoutMs],
  );
  return result.rowCount ?? 0;
}
