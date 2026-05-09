import type { FastifyInstance } from "fastify";

import { checkDb } from "../../db/health.js";

export function registerHealthRoutes(app: FastifyInstance<any, any, any, any>): void {
  app.get("/healthz", async () => ({ status: "ok" }));

  app.get("/readyz", async (_request, reply) => {
    const healthy = await checkDb();
    if (!healthy) {
      return reply.code(503).send({ status: " not_ready".trim() });
    }
    return { status: "ready" };
  });
}
