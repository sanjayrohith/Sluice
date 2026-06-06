export interface TransformEvent {
  id: string;
  source: string;
  headers: Record<string, string>;
  body: unknown | null;
  rawBody: string;
}

export type TransformFunction = (event: TransformEvent) => unknown;
