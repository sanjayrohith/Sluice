import { createHmac } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseSourcesConfig } from "../../src/config/sources.js";
import { pool } from "../../src/db/pool.js";
import { buildServer } from "../../src/http/server.js";
import { countRejections, createScratchSchema } from "../helpers/db.js";

const runDatabaseTests = process.env.RUN_DB_TESTS === "1";
const config = parseSourcesConfig({
  sources: [{ id: "github", provider: "github", secret_env: "GITHUB_WEBHOOK_SECRET", max_body_bytes: 8, destinations: [] }],
  destinations: [],
});

describe.skipIf(!runDatabaseTests)("ingress routes", () => {
  const app = buildServer({ sourcesConfig: config });
  const body = Buffer.from('{"ok":true}');
  const signature = createHmac("sha256", "test-secret").update(body).digest("hex");

  beforeAll(async () => {
    process.env.GITHUB_WEBHOOK_SECRET = "test-secret";
    await createScratchSchema();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("returns 404 for an unknown source", async () => {
    const response = await app.inject({ method: "POST", url: "/in/nope", payload: body });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "unknown_source" });
  });

  it("returns 401 and records a bad signature", async () => {
    const response = await app.inject({ method: "POST", url: "/in/github", payload: body, headers: { "x-hub-signature-256": "sha256=bad" } });
    expect(response.statusCode).toBe(401);
    expect(await countRejections()).toBe(1);
  });

  it("returns 413 for an oversized source body", async () => {
    const response = await app.inject({ method: "POST", url: "/in/github", payload: Buffer.from("123456789"), headers: { "x-hub-signature-256": `sha256=${signature}` } });
    expect(response.statusCode).toBe(413);
  });

  it("accepts a valid GitHub signature", async () => {
    const response = await app.inject({ method: "POST", url: "/in/github", payload: body, headers: { "x-hub-signature-256": `sha256=${signature}` } });
    expect(response.statusCode).toBe(200);
  });
});
