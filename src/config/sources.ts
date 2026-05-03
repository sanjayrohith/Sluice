import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const destinationSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  concurrency: z.number().int().positive().default(10),
  rps: z.number().positive().default(10),
});

const sourceSchema = z.object({
  id: z.string().min(1),
  provider: z.enum(["stripe", "github", "razorpay"]),
  secret_env: z.string().min(1),
  dedup_path: z.string().min(1).optional(),
  destinations: z.array(z.string().min(1)).default([]),
});

const configSchema = z.object({
  sources: z.array(sourceSchema),
  destinations: z.array(destinationSchema),
});

export type SourceConfig = z.infer<typeof sourceSchema>;
export type DestinationConfig = z.infer<typeof destinationSchema>;

export interface SourcesConfig {
  sources: Map<string, SourceConfig>;
  destinations: Map<string, DestinationConfig>;
}

export function parseSourcesConfig(input: unknown): SourcesConfig {
  const result = configSchema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid source configuration:\n${details}`);
  }

  const sources = new Map(result.data.sources.map((source) => [source.id, source]));
  const destinations = new Map(
    result.data.destinations.map((destination) => [destination.id, destination]),
  );

  for (const source of sources.values()) {
    for (const destinationId of source.destinations) {
      if (!destinations.has(destinationId)) {
        throw new Error(
          `Invalid source configuration: source ${source.id} references unknown destination ${destinationId}`,
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
