import Fastify, { type FastifyInstance } from "fastify";

import { logger } from "../lib/logger.js";

export function buildServer(): FastifyInstance {
  return Fastify({
    loggerInstance: logger,
    disableRequestLogging: true,
  });
}
