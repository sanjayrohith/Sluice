import { describe, expect, it } from "vitest";

import { evaluateTransform } from "../../src/transform/runtime.js";

describe("sandbox globals", () => {
  it("provides safe built-ins and no network, filesystem, process, or timer access", async () => {
    const value = await evaluateTransform(
      "export default function () { return { json: typeof JSON, math: typeof Math, date: typeof Date, fetch: typeof fetch, require: typeof require, process: typeof process, timer: typeof setTimeout }; }",
      {},
    );

    expect(value).toEqual({
      json: "object",
      math: "object",
      date: "function",
      fetch: "undefined",
      require: "undefined",
      process: "undefined",
      timer: "undefined",
    });
  });
});
