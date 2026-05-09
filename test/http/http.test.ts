import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import { parseSourcesConfig } from "../../src/config/sources.js";
import { registerRawBody } from "../../src/http/rawBody.js";
import { registerHealthRoutes } from "../../src/http/routes/health.js";

describe("HTTP server components", () => {
  describe("health endpoints", () => {
    it("returns 200 ok on /healthz liveness probe", async () => {
      const app = Fastify();
      registerHealthRoutes(app);

      const response = await app.inject({
        method: "GET",
        url: "/healthz",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok" });
      await app.close();
    });

    it("returns 200 or 503 on /readyz depending on database availability", async () => {
      const app = Fastify();
      registerHealthRoutes(app);

      const response = await app.inject({
        method: "GET",
        url: "/readyz",
      });

      expect([200, 503]).toContain(response.statusCode);
      await app.close();
    });
  });

  describe("raw body capture and size cap", () => {
    const config = parseSourcesConfig({
      sources: [
        {
          id: "demo-source",
          provider: "github",
          secret_env: "TEST_SECRET",
          max_body_bytes: 50,
          destinations: [],
        },
      ],
      destinations: [],
    });

    it("captures raw buffer body without mutating bytes", async () => {
      const app = Fastify();
      registerRawBody(app, config);

      let capturedBuffer: Buffer | undefined;
      app.post("/in/demo-source", async (request, reply) => {
        capturedBuffer = request.rawBody;
        return reply.code(200).send({ received: true });
      });

      const payload = Buffer.from(JSON.stringify({ event: "ping" }));
      const response = await app.inject({
        method: "POST",
        url: "/in/demo-source",
        payload,
      });

      expect(response.statusCode).toBe(200);
      expect(capturedBuffer).toBeDefined();
      expect(Buffer.isBuffer(capturedBuffer)).toBe(true);
      expect(capturedBuffer?.equals(payload)).toBe(true);
      await app.close();
    });

    it("enforces source-level max_body_bytes cap returning 413", async () => {
      const app = Fastify();
      registerRawBody(app, config);

      app.post("/in/demo-source", async (_request, reply) => {
        return reply.code(200).send({ ok: true });
      });

      const oversizedPayload = Buffer.alloc(100, "a");
      const response = await app.inject({
        method: "POST",
        url: "/in/demo-source",
        payload: oversizedPayload,
      });

      expect(response.statusCode).toBe(413);
      await app.close();
    });
  });
});
