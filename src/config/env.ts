import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
    .default("info"),
  MAX_BODY_BYTES: z.coerce.number().int().positive().default(1_048_576),
  SIGNATURE_TOLERANCE_SECONDS: z.coerce.number().int().nonnegative().default(300),
  DISPATCH_BATCH_SIZE: z.coerce.number().int().positive().default(20),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1_000),
  BACKOFF_BASE_MS: z.coerce.number().int().positive().default(5_000),
  BACKOFF_CAP_MS: z.coerce.number().int().positive().default(6 * 60 * 60 * 1_000),
  MAX_ATTEMPTS: z.coerce.number().int().positive().default(12),
  LOCK_TIMEOUT_MS: z.coerce.number().int().positive().default(5 * 60 * 1_000),
  ADMIN_TOKEN: z.string().min(1),
  OTEL_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): EnvConfig {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const key = issue.path.join(".") || "environment";
        return `- ${key}: ${issue.message}`;
      })
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return result.data;
}
