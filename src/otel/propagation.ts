import {
  context,
  propagation,
  ROOT_CONTEXT,
  trace,
  type Context,
} from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";

const w3cPropagator = new W3CTraceContextPropagator();
propagation.setGlobalPropagator(w3cPropagator);

export interface TraceContextFields {
  traceparent?: string;
  tracestate?: string;
}

export function serializeTraceContext(
  activeContext: Context = context.active(),
): TraceContextFields {
  const carrier: Record<string, string> = {};
  w3cPropagator.inject(activeContext, carrier, {
    set: (target, key, value) => {
      target[key] = value;
    },
  });
  return { traceparent: carrier.traceparent, tracestate: carrier.tracestate };
}

export function injectTraceContext(
  headers: Record<string, string>,
  activeContext: Context = context.active(),
): Record<string, string> {
  w3cPropagator.inject(activeContext, headers, {
    set: (target, key, value) => {
      target[key] = value;
    },
  });
  return headers;
}

export function extractTraceContext(fields: TraceContextFields): Context {
  return w3cPropagator.extract(ROOT_CONTEXT, fields, {
    keys: (carrier) => Object.keys(carrier),
    get: (carrier, key) => carrier[key],
  });
}

export function getParentSpanContext(
  activeContext: Context = context.active(),
) {
  const spanContext = trace.getSpanContext(activeContext);
  return spanContext && trace.isSpanContextValid(spanContext)
    ? spanContext
    : undefined;
}
