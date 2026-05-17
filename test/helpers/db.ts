import { randomUUID } from "node:crypto";

import { query } from "../../src/db/pool.js";
import { runMigrations } from "../../src/db/migrate.js";

export async function createScratchSchema(): Promise<string> {
  const schema = `test_${randomUUID().replaceAll("-", "")}`;
  await query(`CREATE SCHEMA "${schema}"`);
  await runMigrations();
  await query("TRUNCATE rejected_events");
  return schema;
}

export async function countRejections(): Promise<number> {
  const result = await query<{ count: string }>("SELECT count(*)::text AS count FROM rejected_events");
  return Number(result.rows[0]?.count ?? 0);
}
