import { request } from "undici";

const BODY_SNIPPET_BYTES = 64 * 1024;

export interface DeliveryResult {
  status: number;
  headers: Record<string, string>;
  bodySnippet: string;
  durationMs: number;
  error?: string;
}

export interface DeliveryInput {
  url: string;
  body: Buffer;
  headers?: Record<string, string>;
}

export async function deliver(input: DeliveryInput): Promise<DeliveryResult> {
  const startedAt = performance.now();

  try {
    const response = await request(input.url, {
      method: "POST",
      headers: input.headers,
      body: input.body,
    });
    const responseBody = await response.body.text();

    return {
      status: response.statusCode,
      headers: headersToRecord(response.headers),
      bodySnippet: responseBody.slice(0, BODY_SNIPPET_BYTES),
      durationMs: elapsedMs(startedAt),
    };
  } catch (error) {
    return {
      status: 0,
      headers: {},
      bodySnippet: "",
      durationMs: elapsedMs(startedAt),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function headersToRecord(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).flatMap(([name, value]) => {
      if (value === undefined) return [];
      return [[name, Array.isArray(value) ? value.join(", ") : value]];
    }),
  );
}

function elapsedMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}
