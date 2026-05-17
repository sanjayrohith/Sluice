import Fastify from "fastify";

import { logger } from "../lib/logger.js";
import { registerRawBody } from "./rawBody.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerIngressRoutes } from "./routes/ingress.js";

export function buildServer() {
  const app = Fastify({
    loggerInstance: logger,
    disableRequestLogging: true,
  });
  registerRawBody(app);
  registerHealthRoutes(app);
  registerIngressRoutes(app);
  return app;
}
