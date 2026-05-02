import { logger } from "./lib/logger.js";
import { loadEnv } from "./config/env.js";

loadEnv();
logger.info("Sluice webhook gateway starting");
