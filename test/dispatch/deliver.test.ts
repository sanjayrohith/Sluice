import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";

import { buildForwardedHeaders, deliver } from "../../src/dispatch/deliver.js";

describe("buildForwardedHeaders", () => {
  it("removes transport and provider signature headers and adds delivery metadata", () => {
    expect(
      buildForwardedHeaders(
        {
          Host: "provider.example",
          "content-length": "42",
          "content-type": "application/json; charset=utf-8",
          "stripe-signature": "t=1,v1=secret",
          "x-request-id": "request-123",
        },
        { eventId: 42, attempt: 3, source: "stripe" },
      ),
    ).toEqual({
      "content-type": "application/json; charset=utf-8",
      "x-request-id": "request-123",
      "x-sluice-event-id": "42",
      "x-sluice-attempt": "3",
      "x-sluice-source": "stripe",
    });
  });
});

describe("deliver HTTP client", () => {
  it("delivers raw payload bytes and forwarded metadata headers to destination", async () => {
    let capturedHeaders: http.IncomingHttpHeaders | undefined;
    let capturedBody = Buffer.alloc(0);

    const server = http.createServer((req, res) => {
      capturedHeaders = req.headers;
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        capturedBody = Buffer.concat(chunks);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ delivered: true }));
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const targetUrl = `http://127.0.0.1:${port}/webhook/endpoint`;

    const binaryPayload = Buffer.from([
      0x00, 0x01, 0x02, 0xff, 0xfe, 0x7b, 0x22, 0x65, 0x76, 0x65, 0x6e, 0x74, 0x22, 0x3a, 0x22, 0x74, 0x65, 0x73, 0x74, 0x22, 0x7d,
    ]);
    const headers = buildForwardedHeaders(
      {
        "content-type": "application/octet-stream",
        "x-custom-tracking": "trace-999",
      },
      { eventId: "evt_12345", attempt: 1, source: "stripe" },
    );

    const result = await deliver({
      url: targetUrl,
      body: binaryPayload,
      headers,
    });

    server.close();

    expect(result.status).toBe(200);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.bodySnippet).toBe(JSON.stringify({ delivered: true }));
    expect(capturedBody.equals(binaryPayload)).toBe(true);
    expect(capturedHeaders?.["x-sluice-event-id"]).toBe("evt_12345");
    expect(capturedHeaders?.["x-sluice-attempt"]).toBe("1");
    expect(capturedHeaders?.["x-sluice-source"]).toBe("stripe");
    expect(capturedHeaders?.["x-custom-tracking"]).toBe("trace-999");
    expect(capturedHeaders?.["content-type"]).toBe("application/octet-stream");
  });

  it("handles destination errors gracefully returning status 0 with error details", async () => {
    const result = await deliver({
      url: "http://127.0.0.1:1/nonexistent",
      body: Buffer.from("test"),
    });

    expect(result.status).toBe(0);
    expect(result.error).toBeDefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
