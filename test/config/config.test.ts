import { describe, expect, it } from "vitest";

import { loadEnv } from "../../src/config/env.js";
import { parseSourcesConfig } from "../../src/config/sources.js";

describe("configuration loaders", () => {
  describe("environment configuration", () => {
    it("parses valid environment variables with defaults", () => {
      const parsed = loadEnv({
        DATABASE_URL: "postgres://postgres:postgres@localhost:5432/sluice_test",
        ADMIN_TOKEN: "dev-admin-token",
      });

      expect(parsed.DATABASE_URL).toBe(
        "postgres://postgres:postgres@localhost:5432/sluice_test",
      );
      expect(parsed.PORT).toBe(3000);
      expect(parsed.LOG_LEVEL).toBe("info");
      expect(parsed.ADMIN_TOKEN).toBe("dev-admin-token");
      expect(parsed.MAX_BODY_BYTES).toBe(1_048_576);
      expect(parsed.SIGNATURE_TOLERANCE_SECONDS).toBe(300);
    });

    it("respects custom port and log level values", () => {
      const parsed = loadEnv({
        PORT: "8080",
        LOG_LEVEL: "debug",
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
        ADMIN_TOKEN: "secret-token-123",
      });

      expect(parsed.PORT).toBe(8080);
      expect(parsed.LOG_LEVEL).toBe("debug");
      expect(parsed.ADMIN_TOKEN).toBe("secret-token-123");
    });

    it("rejects invalid environment variables", () => {
      expect(() =>
        loadEnv({
          PORT: "not-a-number",
          DATABASE_URL: "",
        }),
      ).toThrow(/Invalid environment configuration/);
    });
  });

  describe("YAML sources & destinations parser", () => {
    const validConfig = {
      destinations: [
        {
          id: "billing-service",
          url: "https://billing.internal/webhooks",
          concurrency: 5,
          rps: 20,
          timeout_ms: 5000,
        },
        {
          id: "analytics",
          url: "https://analytics.internal/ingest",
        },
      ],
      sources: [
        {
          id: "stripe-prod",
          provider: "stripe",
          secret_env: "STRIPE_WEBHOOK_SECRET",
          destinations: ["billing-service", "analytics"],
          dedup_path: "$.id",
        },
      ],
    };

    it("successfully parses valid source and destination mappings with defaults", () => {
      const { sources, destinations } = parseSourcesConfig(validConfig);

      expect(sources.size).toBe(1);
      expect(destinations.size).toBe(2);

      const stripeSource = sources.get("stripe-prod");
      expect(stripeSource).toBeDefined();
      expect(stripeSource?.provider).toBe("stripe");
      expect(stripeSource?.destinations).toEqual(["billing-service", "analytics"]);

      const analyticsDest = destinations.get("analytics");
      expect(analyticsDest).toBeDefined();
      expect(analyticsDest?.concurrency).toBe(10); // default
      expect(analyticsDest?.rps).toBe(10); // default
      expect(analyticsDest?.timeout_ms).toBe(30_000); // default
    });

    it("throws when a source references an unknown destination", () => {
      const invalidConfig = {
        destinations: [{ id: "billing", url: "https://billing.internal" }],
        sources: [
          {
            id: "github-source",
            provider: "github",
            secret_env: "GITHUB_SECRET",
            destinations: ["billing", "non-existent-dest"],
          },
        ],
      };

      expect(() => parseSourcesConfig(invalidConfig)).toThrow(
        /references unknown destination non-existent-dest/,
      );
    });

    it("rejects unknown webhook providers", () => {
      const invalidProviderConfig = {
        destinations: [],
        sources: [
          {
            id: "unknown-source",
            provider: "unknown_provider",
            secret_env: "SECRET",
          },
        ],
      };

      expect(() => parseSourcesConfig(invalidProviderConfig)).toThrow(
        /Invalid source configuration/,
      );
    });
  });
});
