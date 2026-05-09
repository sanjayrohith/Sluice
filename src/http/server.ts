import Fastify from "fastify";

import { logger } from "../lib/logger.js";
import { registerRawBody } from "./rawBody.js";

export function buildServer() {
  const app = Fastify({
    loggerInstance: logger,
    disableRequestLogging: true,
  });
  registerRawBody(app);
  return app;
}
