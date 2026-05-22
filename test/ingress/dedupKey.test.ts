import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { extractDedupKey } from "../../src/ingress/dedupKey.js";

const stripeFixture = readFileSync(
  resolve("test/fixtures/stripe.json"),
);
const razorpayFixture = readFileSync(
  resolve("test/fixtures/razorpay.json"),
);

describe("extractDedupKey", () => {
  it("extracts a Stripe event id from string payload", () => {
    expect(extractDedupKey(Buffer.from('{"id":"evt_123"}'), "$.id")).toBe("evt_123");
  });

  it("extracts Stripe event id from fixture payload", () => {
    expect(extractDedupKey(stripeFixture, "$.id")).toBe("evt_test");
  });

  it("extracts a nested Razorpay payment id from string payload", () => {
    const body = Buffer.from(
      '{"payload":{"payment":{"entity":{"id":"pay_123"}}}}',
    );
    expect(extractDedupKey(body, "$.payload.payment.entity.id")).toBe("pay_123");
  });

  it("extracts nested Razorpay payment id from fixture payload", () => {
    expect(
      extractDedupKey(razorpayFixture, "$.payload.payment.entity.id"),
    ).toBe("pay_test");
  });

  it("extracts values using custom path expressions including array indices and numbers", () => {
    const customPayload = Buffer.from(
      JSON.stringify({
        data: {
          items: [
            { code: "item_0" },
            { code: "item_1", count: 42, active: true },
          ],
        },
      }),
    );

    expect(extractDedupKey(customPayload, "$.data.items[0].code")).toBe("item_0");
    expect(extractDedupKey(customPayload, "$.data.items[1].code")).toBe("item_1");
    expect(extractDedupKey(customPayload, "$.data.items[1].count")).toBe("42");
    expect(extractDedupKey(customPayload, "$.data.items[1].active")).toBe("true");
  });

  it.each([
    ["missing path", Buffer.from('{"id":"evt_123"}'), "$.data.id"],
    ["invalid JSON", Buffer.from("not-json"), "$.id"],
    ["unsupported path", Buffer.from('{"id":"evt_123"}'), "id"],
    ["object value", Buffer.from('{"data":{}}'), "$.data"],
    ["array out of bounds", Buffer.from('{"items":[1]}'), "$.items[5]"],
  ])("returns null for %s", (_name, body, path) => {
    expect(extractDedupKey(body, path)).toBeNull();
  });
});
