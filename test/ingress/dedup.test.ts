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
      id: "stripe",
      provider: "stripe",
      secret_env: "STRIPE_WEBHOOK_SECRET",
      dedup_path: "$.id",
      destinations: [],
    },
    {
      id: "github",
      provider: "github",
      secret_env: "GITHUB_WEBHOOK_SECRET",
      destinations: [],
    },
  ],
  destinations: [],
});

describe.skipIf(!runDatabaseTests)("ingress deduplication", () => {
  const app = buildServer({ sourcesConfig: config });

  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "stripe-secret";
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

  it("stores three replays of the same signed Stripe event once", async () => {
    const body = Buffer.from('{"id":"evt_replayed","type":"payment_intent.created"}');
    const timestamp = Math.floor(Date.now() / 1_000).toString();
    const signedPayload = `${timestamp}.${body.toString("utf8")}`;
    const digest = createHmac("sha256", "stripe-secret").update(signedPayload).digest("hex");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/in/stripe",
        payload: body,
        headers: { "stripe-signature": `t=${timestamp},v1=${digest}` },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().duplicate).toBe(attempt > 0);
    }

    const result = await query<{ count: string }>(
      "SELECT count(*)::text AS count FROM events WHERE source_id = 'stripe'",
    );
    expect(result.rows[0]?.count).toBe("1");
  });

  it("stores distinct provider event ids even when their shape is the same", async () => {
    for (const id of ["evt_one", "evt_two"]) {
      const body = Buffer.from(JSON.stringify({ id, type: "payment_intent.created" }));
      const timestamp = Math.floor(Date.now() / 1_000).toString();
      const digest = createHmac("sha256", "stripe-secret")
        .update(`${timestamp}.${body.toString("utf8")}`)
        .digest("hex");
      const response = await app.inject({
        method: "POST",
        url: "/in/stripe",
        payload: body,
        headers: { "stripe-signature": `t=${timestamp},v1=${digest}` },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().duplicate).toBe(false);
    }

    const result = await query<{ count: string }>(
      "SELECT count(*)::text AS count FROM events WHERE source_id = 'stripe'",
    );
    expect(result.rows[0]?.count).toBe("2");
  });

  it("stores every event when the source has no dedup key", async () => {
    const body = Buffer.from('{"action":"ping"}');
    const signature = createHmac("sha256", "github-secret").update(body).digest("hex");

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/in/github",
        payload: body,
        headers: { "x-hub-signature-256": `sha256=${signature}` },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().duplicate).toBe(false);
    }

    const result = await query<{ count: string }>(
      "SELECT count(*)::text AS count FROM events WHERE source_id = 'github'",
    );
    expect(result.rows[0]?.count).toBe("2");
  });
});
