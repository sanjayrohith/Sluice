import type { FastifyInstance } from "fastify";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { loadSourcesConfig, type SourcesConfig } from "../../config/sources.js";
import { loadEnv } from "../../config/env.js";
import { getVerifier } from "../../verify/registry.js";
import { recordRejection } from "../../db/repositories/rejectedEvents.js";
import { normalizeHeaders } from "../../ingress/headers.js";
import "../../verify/providers/github.js";
import "../../verify/providers/razorpay.js";
import "../../verify/providers/stripe.js";

interface IngressParams {
  source_id: string;
}

export function registerIngressRoutes(
  app: FastifyInstance<any, any, any, any>,
  config = tryLoadSources(),
): void {
  app.post<{ Params: IngressParams }>("/in/:source_id", async (request, reply) => {
    const source = config?.sources.get(request.params.source_id);
    if (!source) {
      return reply.code(404).send({ error: "unknown_source" });
    }

    const secret = process.env[source.secret_env];
    if (!secret) {
      return reply.code(401).send({ error: "missing_secret" });
    }

    const headers = normalizeHeaders(request.headers);
    const result = getVerifier(source.provider)({
      rawBody: request.rawBody,
      headers,
      secret,
      toleranceSeconds: loadEnv().SIGNATURE_TOLERANCE_SECONDS,
    });
    if (!result.ok) {
      await recordRejection({
        sourceId: source.id,
        reason: result.reason,
        rawBody: request.rawBody,
        headers,
      });
      return reply.code(401).send({ error: result.reason });
    }
    return reply.code(200).send({ accepted: true });
  });
}

function tryLoadSources(): SourcesConfig | undefined {
  try {
    return loadSourcesConfig();
  } catch {
    return undefined;
  }
}
