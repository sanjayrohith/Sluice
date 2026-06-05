import { query } from "../pool.js";

const MAX_RESPONSE_BODY_BYTES = 64 * 1024;

export interface AttemptRecord {
  eventId: string | number;
  deliveryId?: string | number | null;
  attemptNumber: number;
  destinationId: string;
  requestHeaders: Record<string, string>;
  responseStatus: number;
  responseHeaders: Record<string, string>;
  responseBody: string;
  durationMs: number;
  error?: string;
}

export async function recordAttempt(input: AttemptRecord): Promise<void> {
  await query(
    `INSERT INTO delivery_attempts (
       event_id, delivery_id, attempt_number, destination_id, request_headers,
       response_status, response_headers, response_body, duration_ms, error
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, $9, $10)`,
    [
      input.eventId,
      input.deliveryId ?? null,
      input.attemptNumber,
      input.destinationId,
      JSON.stringify(input.requestHeaders),
      input.responseStatus,
      JSON.stringify(input.responseHeaders),
      truncateResponseBody(input.responseBody),
      input.durationMs,
      input.error ?? null,
    ],
  );
}

export function truncateResponseBody(responseBody: string): string {
  return responseBody.slice(0, MAX_RESPONSE_BODY_BYTES);
}
