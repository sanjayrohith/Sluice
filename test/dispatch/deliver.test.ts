import { describe, expect, it } from "vitest";

import { buildForwardedHeaders } from "../../src/dispatch/deliver.js";

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
