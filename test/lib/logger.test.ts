import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { context, ROOT_CONTEXT, trace } from "@opentelemetry/api";
import { PassThrough } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createLogger } from "../../src/lib/logger.js";

const contextManager = new AsyncLocalStorageContextManager();

beforeAll(() => {
  context.setGlobalContextManager(contextManager.enable());
});

afterAll(() => {
  contextManager.disable();
});

describe("structured logger", () => {
  it("adds trace and span ids from the active span", async () => {
    const stream = new PassThrough();
    const logger = createLogger(stream);
    const active = trace.setSpan(
      ROOT_CONTEXT,
      trace.wrapSpanContext({
        traceId: "0123456789abcdef0123456789abcdef",
        spanId: "0123456789abcdef",
        traceFlags: 1,
      }),
    );
    const line = new Promise<string>((resolve) => {
      stream.once("data", (chunk) => resolve(chunk.toString()));
    });

    context.with(active, () => logger.info({ action: "test" }, "hello"));

    expect(JSON.parse(await line)).toMatchObject({
      action: "test",
      trace_id: "0123456789abcdef0123456789abcdef",
      span_id: "0123456789abcdef",
    });
    logger.flush();
  });
});
