import { loadSourcesConfig } from "./config/sources.js";
import { DispatcherWorker } from "./dispatch/worker.js";
import { loadEnv } from "./config/env.js";

const env = loadEnv();
const worker = new DispatcherWorker({
  sourcesConfig: loadSourcesConfig(),
  batchSize: env.DISPATCH_BATCH_SIZE,
  pollIntervalMs: env.POLL_INTERVAL_MS,
  maxAttempts: env.MAX_ATTEMPTS,
  backoffBaseMs: env.BACKOFF_BASE_MS,
  backoffCapMs: env.BACKOFF_CAP_MS,
});

const stopping = new Promise<void>((resolve) => {
  const stop = () => {
    worker.stop();
    resolve();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
});

await Promise.race([worker.run(), stopping]);
