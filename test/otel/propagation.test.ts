import { propagation, ROOT_CONTEXT, trace } from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { beforeAll, describe, expect, it } from "vitest";

import { buildForwardedHeaders } from "../../src/dispatch/deliver.js";
import { deliverySpanAttributes } from "../../src/otel/attributes.js";
import {
  extractTraceContext,
  injectTraceContext,
  serializeTraceContext,
} from "../../src/otel/propagation.js";

beforeAll(() => {
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
});

describe("OpenTelemetry propagation", () => {
  const spanContext = {
    traceId: "0123456789abcdef0123456789abcdef",
    spanId: "0123456789abcdef",
    traceFlags: 1,
  };

  it("serializes and extracts a W3C queue context", () => {
    const active = trace.setSpan(
      ROOT_CONTEXT,
      trace.wrapSpanContext(spanContext),
    );
    const fields = serializeTraceContext(active);
    expect(fields.traceparent).toBe(
      "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
    );
    expect(trace.getSpanContext(extractTraceContext(fields))).toMatchObject(
      spanContext,
    );
  });

  it("injects the active context into downstream headers", () => {
    const active = trace.setSpan(
      ROOT_CONTEXT,
      trace.wrapSpanContext(spanContext),
    );
    const headers = buildForwardedHeaders(
      {},
      { eventId: 42, attempt: 1, source: "stripe" },
    );
    injectTraceContext(headers, active);
    expect(headers.traceparent).toBe(
      "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
    );
  });

  it("defines stable delivery span attributes", () => {
    expect(
      deliverySpanAttributes({
        eventId: 42,
        sourceId: "stripe",
        destinationId: "billing",
        attempt: 2,
      }),
    ).toEqual({
      "sluice.event_id": "42",
      "sluice.source_id": "stripe",
      "sluice.destination_id": "billing",
      "sluice.attempt": 2,
    });
  });
});
