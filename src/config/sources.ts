import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

export interface DestinationConfig {
  id: string;
  url: string;
  concurrency?: number;
  rps?: number;
  timeout_ms?: number;
}

export interface SourceConfig {
  id: string;
  provider: "stripe" | "github" | "razorpay" | string;
  secret_env: string;
  dedup_path?: string;
  destinations: string[];
  max_body_bytes?: number;
  transform?: string;
}

export interface SourcesConfig {
  sources: Map<string, SourceConfig>;
  destinations: Map<string, DestinationConfig>;
}

export function parseSourcesConfig(input: any): SourcesConfig {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid source configuration: expected root object");
  }

  const sourcesList = Array.isArray(input.sources) ? input.sources : [];
  const destinationsList = Array.isArray(input.destinations) ? input.destinations : [];

  const sources = new Map<string, SourceConfig>();
  for (const source of sourcesList) {
    if (!source.id) throw new Error("Invalid source configuration: source missing id");
    sources.set(source.id, {
      ...source,
      destinations: Array.isArray(source.destinations) ? source.destinations : [],
    });
  }

  const destinations = new Map<string, DestinationConfig>();
  for (const destination of destinationsList) {
    if (!destination.id) throw new Error("Invalid source configuration: destination missing id");
    destinations.set(destination.id, {
      concurrency: 10,
      rps: 10,
      timeout_ms: 30000,
      ...destination,
    });
  }

  for (const source of sources.values()) {
    for (const destinationId of source.destinations) {
      if (!destinations.has(destinationId)) {
        throw new Error(
          ,
        );
      }
    }
  }

  return { sources, destinations };
}

export function loadSourcesConfig(filePath = "sluice.config.yaml"): SourcesConfig {
  const absolutePath = resolve(filePath);
  return parseSourcesConfig(parse(readFileSync(absolutePath, "utf8")));
}
