import { pool } from "./pool.js";

export async function checkDb(): Promise<boolean> {
  const client = await pool.connect().catch(() => undefined);
  if (!client) {
    return false;
  }

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = 1000");
    await client.query("SELECT 1");
    await client.query("COMMIT");
    return true;
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    return false;
  } finally {
    client.release();
  }
}
