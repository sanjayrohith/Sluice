import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseSourcesConfig } from "../../src/config/sources.js";
import { query, pool } from "../../src/db/pool.js";
import { buildServer } from "../../src/http/server.js";
import { DispatcherWorker } from "../../src/dispatch/worker.js";
import { createScratchSchema } from "../helpers/db.js";

const runDatabaseTests = process.env.RUN_DB_TESTS === "1";

interface ReceivedEvent {
  body: string;
  destination: string;
}

describe.skipIf(!runDatabaseTests)("transform fan-out", () => {
  let app: ReturnType<typeof buildServer>;
  let worker: DispatcherWorker;
  let workerRun: Promise<void>;
  let billing: Server;
  let analytics: Server;
  const received: ReceivedEvent[] = [];

  beforeAll(async () => {
    await createScratchSchema();
    const billingTarget = await startTarget("billing");
    const analyticsTarget = await startTarget("analytics");
    billing = billingTarget.server;
    analytics = analyticsTarget.server;
    const config = parseSourcesConfig({
      sources: [
        {
          id: "stripe",
          provider: "stripe",
          secret_env: "STRIPE_WEBHOOK_SECRET",
          dedup_path: "$.id",
          transform: "transforms/stripe-invoice-paid.js",
          destinations: ["billing", "analytics"],
        },
      ],
      destinations: [
        { id: "billing", url: billingTarget.url, concurrency: 2, rps: 100 },
        { id: "analytics", url: analyticsTarget.url, concurrency: 2, rps: 100 },
      ],
    });
    process.env.STRIPE_WEBHOOK_SECRET = "test-secret";
    app = buildServer({ sourcesConfig: config });
    await app.ready();
    worker = new DispatcherWorker({
      sourcesConfig: config,
      pollIntervalMs: 10,
      backoffBaseMs: 1,
      backoffCapMs: 10,
    });
    workerRun = worker.run();
  });

  afterAll(async () => {
    worker.stop();
    await workerRun;
    await app.close();
    await closeServer(billing);
    await closeServer(analytics);
    await pool.end();
  });

  it("fans out a paid invoice and filters other event types", async () => {
    const paid = JSON.stringify({
      id: `evt_paid_${Date.now()}`,
      type: "invoice.paid",
      data: {
        object: {
          id: "in_123",
          amount_paid: 4200,
          currency: "usd",
          customer: "cus_123",
        },
      },
    });
    const filtered = JSON.stringify({
      id: `evt_created_${Date.now()}`,
      type: "invoice.created",
      data: {
        object: {
          id: "in_456",
          amount_paid: 0,
          currency: "usd",
          customer: "cus_456",
        },
      },
    });

    expect((await postSigned(paid)).statusCode).toBe(200);
    expect((await postSigned(filtered)).statusCode).toBe(200);
    await eventually(() => received.length === 2);

    expect(received.map((event) => event.destination).sort()).toEqual([
      "analytics",
      "billing",
    ]);
    expect(
      received.every(
        (event) =>
          event.body ===
          '{"id":"in_123","amount":4200,"currency":"usd","customer":"cus_123"}',
      ),
    ).toBe(true);
    const filteredEvent = await query<{ status: string }>(
      "SELECT status FROM events WHERE dedup_key = $1",
      [JSON.parse(filtered).id],
    );
    expect(filteredEvent.rows[0]?.status).toBe("filtered");
  }, 15_000);

  async function postSigned(body: string) {
    const timestamp = Math.floor(Date.now() / 1_000);
    const signature = createHmac("sha256", "test-secret")
      .update(`${timestamp}.${body}`)
      .digest("hex");
    return app.inject({
      method: "POST",
      url: "/in/stripe",
      payload: body,
      headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
    });
  }
});

async function startTarget(
  destination: string,
): Promise<{ url: string; server: Server }> {
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.push({
        body: Buffer.concat(chunks).toString("utf8"),
        destination,
      });
      response.statusCode = 200;
      response.end("ok");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("target server did not bind");
  return { url: `http://127.0.0.1:${address.port}/hook`, server };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

async function eventually(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  expect(predicate()).toBe(true);
}
