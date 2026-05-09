import type { FastifyInstance } from "fastify";

import { loadEnv } from "../config/env.js";

export function registerRawBody(app: FastifyInstance<any, any, any, any>): void {
  const env = loadEnv();

  app.decorateRequest("rawBody");
  app.addContentTypeParser(
    "*",
    { parseAs: "buffer", bodyLimit: env.MAX_BODY_BYTES },
    (request, body, done) => {
      request.rawBody = body as Buffer;
      done(null, body);
    },
  );
}
