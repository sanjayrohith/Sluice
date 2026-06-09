import { SpanStatusCode, type Span } from "@opentelemetry/api";

export interface DeliverySpanInput {
  eventId: string | number;
  sourceId: string;
  destinationId: string;
  attempt: number;
}

export interface DeliverySpanResult {
  status: number;
  error?: string;
}

export function deliverySpanAttributes(
  input: DeliverySpanInput,
): Record<string, string | number> {
  return {
    "sluice.event_id": String(input.eventId),
    "sluice.source_id": input.sourceId,
    "sluice.destination_id": input.destinationId,
    "sluice.attempt": input.attempt,
  };
}

export function annotateDeliverySpan(
  span: Span,
  result: DeliverySpanResult,
): void {
  span.setAttribute("http.response.status_code", result.status);
  if (result.status >= 200 && result.status < 300) {
    span.setStatus({ code: SpanStatusCode.OK });
    return;
  }

  const reason = result.error ?? `downstream returned HTTP ${result.status}`;
  span.recordException(reason);
  span.setStatus({ code: SpanStatusCode.ERROR, message: reason });
}
