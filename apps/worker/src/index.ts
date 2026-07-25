import pino from "pino";

import { loadWorkerConfig } from "./config.js";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
const config = loadWorkerConfig();

logger.info({ redisUrl: config.redisUrl }, "worker booted");

process.on("SIGTERM", () => {
  logger.info("worker received SIGTERM");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("worker received SIGINT");
  process.exit(0);
});
