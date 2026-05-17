import type { FastifyInstance } from "fastify";

import { loadSourcesConfig, type SourcesConfig } from "../../config/sources.js";

interface IngressParams {
  source_id: string;
}

export function registerIngressRoutes(
  app: FastifyInstance<any, any, any, any>,
  config = tryLoadSources(),
): void {
  app.post<{ Params: IngressParams }>("/in/:source_id", async (request, reply) => {
    if (!config?.sources.has(request.params.source_id)) {
      return reply.code(404).send({ error: "unknown_source" });
    }
    return reply.code(202).send({ accepted: true });
  });
}

function tryLoadSources(): SourcesConfig | undefined {
  try {
    return loadSourcesConfig();
  } catch {
    return undefined;
  }
}
