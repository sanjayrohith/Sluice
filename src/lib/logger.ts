import pino from "pino";
import type { DestinationStream, LoggerOptions } from "pino";
import { trace } from "@opentelemetry/api";

export function traceLogFields(): Record<string, string> {
  const spanContext = trace.getActiveSpan()?.spanContext();
  if (!spanContext) return {};
  return { trace_id: spanContext.traceId, span_id: spanContext.spanId };
}

const loggerOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "sluice" },
  timestamp: pino.stdTimeFunctions.isoTime,
  mixin: traceLogFields,
  ...(process.env.NODE_ENV === "development"
    ? { transport: { target: "pino-pretty" } }
    : {}),
};

export function createLogger(stream?: DestinationStream) {
  return stream ? pino(loggerOptions, stream) : pino(loggerOptions);
}

export const logger = createLogger();
