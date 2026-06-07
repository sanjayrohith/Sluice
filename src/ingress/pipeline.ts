import { createDeliveries } from "../db/repositories/deliveries.js";
import { markFiltered, markQuarantined } from "../db/repositories/events.js";
import { buildTransformInput } from "../transform/input.js";
import { TransformRegistry } from "../transform/registry.js";
import {
  resolveTransformDestinations,
  serializeTransformBody,
  validateTransformResult,
} from "../transform/result.js";
import { evaluateTransform } from "../transform/runtime.js";
import type { SourcesConfig } from "../config/sources.js";

export async function runTransformPipeline(input: {
  eventId: number;
  sourceId: string;
  rawBody: Buffer;
  headers: Record<string, string>;
  configuredDestinations: string[];
  config: SourcesConfig;
  registry: TransformRegistry;
}): Promise<void> {
  const source = input.config.sources.get(input.sourceId);
  if (!source?.transform) {
    await createDeliveries(input.eventId, input.configuredDestinations);
    return;
  }

  try {
    const transform = await input.registry.load(input.sourceId);
    const value = await evaluateTransform(
      transform.source,
      buildTransformInput(
        input.eventId,
        input.sourceId,
        input.headers,
        input.rawBody,
      ),
    );
    const result = validateTransformResult(value);
    if (result.kind === "drop") {
      await markFiltered(input.eventId);
      return;
    }

    const destinations = resolveTransformDestinations(
      result.value.destinations,
      input.config.destinations,
    );
    const body =
      result.value.body === undefined
        ? null
        : serializeTransformBody(result.value.body);
    await createDeliveries(input.eventId, destinations, body);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await markQuarantined(input.eventId, reason);
  }
}
