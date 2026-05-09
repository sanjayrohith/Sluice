import type { FastifyInstance } from "fastify";

import { loadEnv } from "../config/env.js";
import { loadSourcesConfig } from "../config/sources.js";

export function registerRawBody(app: FastifyInstance<any, any, any, any>): void {
  const env = loadEnv();
  let sourcesConfig: ReturnType<typeof loadSourcesConfig> | undefined;

  try {
    sourcesConfig = loadSourcesConfig();
  } catch {
    // The source file is optional while the server is being bootstrapped.
  }

  app.decorateRequest("rawBody");
  app.addContentTypeParser(
    "*",
    { parseAs: "buffer", bodyLimit: env.MAX_BODY_BYTES },
    (request, body, done) => {
      const sourceId = request.raw.url?.match(/^\/in\/([^/?]+)/)?.[1];
      const sourceLimit = sourceId ? sourcesConfig?.sources.get(sourceId)?.max_body_bytes : undefined;
      if (sourceLimit !== undefined && (body as Buffer).byteLength > sourceLimit) {
        const error = new Error("request body exceeds the configured limit") as Error & {
          statusCode?: number;
        };
        error.statusCode = 413;
        done(error);
        return;
      }
      request.rawBody = body as Buffer;
      done(null, body);
    },
  );
}
