import Fastify from "fastify";

import { logger } from "../lib/logger.js";
import { registerRawBody } from "./rawBody.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerIngressRoutes } from "./routes/ingress.js";
import type { SourcesConfig } from "../config/sources.js";

export function buildServer(options: { sourcesConfig?: SourcesConfig } = {}) {
  const app = Fastify({
    loggerInstance: logger,
    disableRequestLogging: true,
  });
  registerRawBody(app, options.sourcesConfig);
  registerHealthRoutes(app);
  registerIngressRoutes(app, options.sourcesConfig);
  return app;
}
