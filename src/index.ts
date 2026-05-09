import { logger } from "./lib/logger.js";
import { loadEnv } from "./config/env.js";
import { checkDb } from "./db/health.js";
import { runMigrations } from "./db/migrate.js";
import { query } from "./db/pool.js";
import { buildServer } from "./http/server.js";

const env = loadEnv();

await runMigrations();
const serverVersion = await query<{ server_version: string }>(
  "SELECT current_setting('server_version') AS server_version",
);
logger.info({ event: "db.ready", serverVersion: serverVersion.rows[0]?.server_version }, "db.ready");
logger.info({ port: env.PORT, dbHealthy: await checkDb() }, "Sluice webhook gateway starting");

const server = buildServer();
await server.listen({ port: env.PORT, host: "0.0.0.0" });

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutting down");
  await server.close();
  const { pool } = await import("./db/pool.js");
  await pool.end();
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
