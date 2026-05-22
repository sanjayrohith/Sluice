import { createHmac } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { parseSourcesConfig } from "../../src/config/sources.js";
import { pool, query } from "../../src/db/pool.js";
import { buildServer } from "../../src/http/server.js";
import { createScratchSchema } from "../helpers/db.js";

const runDatabaseTests = process.env.RUN_DB_TESTS === "1";
const config = parseSourcesConfig({
  sources: [
    {
      id: "github",
      provider: "github",
      secret_env: "GITHUB_WEBHOOK_SECRET",
      destinations: [],
    },
  ],
  destinations: [],
});

describe.skipIf(!runDatabaseTests)("ingress storage fidelity", () => {
  const app = buildServer({ sourcesConfig: config });

  beforeAll(async () => {
    process.env.GITHUB_WEBHOOK_SECRET = "github-secret";
    await createScratchSchema();
    await app.ready();
  });

  beforeEach(async () => {
    await query("TRUNCATE events, rejected_events RESTART IDENTITY");
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("preserves exact byte sequence in BYTEA including binary and high-bit characters", async () => {
    // Non-ASCII and arbitrary byte sequences
    const rawBytes = Buffer.from([
      0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd, 0x7b, 0x22, 0x6d, 0x73, 0x67, 0x22,
      0x3a, 0x22, 0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x22, 0x7d,
    ]);
    const signature = createHmac("sha256", "github-secret")
      .update(rawBytes)
      .digest("hex");

    const response = await app.inject({
      method: "POST",
      url: "/in/github",
      payload: rawBytes,
      headers: {
        "content-type": "application/octet-stream",
        "x-hub-signature-256": `sha256=${signature}`,
      },
    });

    expect(response.statusCode).toBe(200);

    const result = await query<{ raw_body: Buffer }>(
      "SELECT raw_body FROM events WHERE source_id = 'github' LIMIT 1",
    );
    expect(result.rows.length).toBe(1);
    expect(Buffer.isBuffer(result.rows[0].raw_body)).toBe(true);
    expect(result.rows[0].raw_body.equals(rawBytes)).toBe(true);
  });

  it("normalizes and sanitizes inbound headers before database storage", async () => {
    const body = Buffer.from('{"action":"labeled"}');
    const signature = createHmac("sha256", "github-secret")
      .update(body)
      .digest("hex");

    const response = await app.inject({
      method: "POST",
      url: "/in/github",
      payload: body,
      headers: {
        "x-hub-signature-256": `sha256=${signature}`,
        "X-Custom-Header": "CustomValue",
        "Connection": "keep-alive",
        "Transfer-Encoding": "chunked",
        "Upgrade": "websocket",
      },
    });

    expect(response.statusCode).toBe(200);

    const result = await query<{ headers: Record<string, string> }>(
      "SELECT headers FROM events WHERE source_id = 'github' LIMIT 1",
    );
    expect(result.rows.length).toBe(1);
    const storedHeaders = result.rows[0].headers;

    // Retained and lowercased
    expect(storedHeaders["x-custom-header"]).toBe("CustomValue");
    expect(storedHeaders["x-hub-signature-256"]).toBe(`sha256=${signature}`);

    // Hop-by-hop stripped
    expect(storedHeaders).not.toHaveProperty("connection");
    expect(storedHeaders).not.toHaveProperty("transfer-encoding");
    expect(storedHeaders).not.toHaveProperty("upgrade");
  });
});
