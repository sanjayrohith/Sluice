import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { withTransaction } from "./pool.js";

const MIGRATION_LOCK_KEY = "sluice:schema-migrations";

export async function runMigrations(
  migrationsDir = join(process.cwd(), "migrations"),
): Promise<void> {
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [MIGRATION_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    for (const filename of files) {
      const alreadyApplied = await client.query(
        "SELECT 1 FROM schema_migrations WHERE filename = $1",
        [filename],
      );
      if (alreadyApplied.rowCount !== 0) {
        continue;
      }

      const sql = await readFile(join(migrationsDir, filename), "utf8");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { pool } = await import("./pool.js");
  try {
    await runMigrations();
  } finally {
    await pool.end();
  }
}
