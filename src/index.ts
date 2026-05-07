import { logger } from "./lib/logger.js";
import { loadEnv } from "./config/env.js";
import { checkDb } from "./db/health.js";
import { runMigrations } from "./db/migrate.js";
import { query } from "./db/pool.js";

const env = loadEnv();

await runMigrations();
const serverVersion = await query<{ server_version: string }>(
  "SELECT current_setting('server_version') AS server_version",
);
logger.info({ event: "db.ready", serverVersion: serverVersion.rows[0]?.server_version }, "db.ready");
logger.info({ port: env.PORT, dbHealthy: await checkDb() }, "Sluice webhook gateway starting");
