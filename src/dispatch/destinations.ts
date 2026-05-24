import type { DestinationConfig, SourcesConfig } from "../config/sources.js";

export class UnknownDestinationError extends Error {
  constructor(destinationId: string) {
    super(`Unknown destination: ${destinationId}`);
    this.name = "UnknownDestinationError";
  }
}

export function createDestinationResolver(config: SourcesConfig) {
  validateDestinationReferences(config);

  return (destinationId: string): DestinationConfig => {
    const destination = config.destinations.get(destinationId);
    if (!destination) {
      throw new UnknownDestinationError(destinationId);
    }
    return destination;
  };
}

export function validateDestinationReferences(config: SourcesConfig): void {
  for (const source of config.sources.values()) {
    for (const destinationId of source.destinations) {
      if (!config.destinations.has(destinationId)) {
        throw new Error(
          `Invalid source configuration: source ${source.id} references unknown destination ${destinationId}`,
        );
      }
    }
  }
}
