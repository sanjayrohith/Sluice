import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

import { loadEnv } from "../config/env.js";
import { logger } from "../lib/logger.js";

const env = loadEnv();

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  statement_timeout: 5_000,
});

const SLOW_QUERY_MS = 250;

export async function query<R extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<QueryResult<R>> {
  const startedAt = performance.now();
  const result = await pool.query<R>(text, values);
  logSlowQuery(text, performance.now() - startedAt);
  return result;
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function logSlowQuery(text: string, durationMs: number): void {
  if (durationMs >= SLOW_QUERY_MS) {
    logger.warn({ durationMs: Math.round(durationMs), query: text }, "slow database query");
  }
}
