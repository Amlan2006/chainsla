import pino from "pino";
import { Store } from "@rpc-sla/database";

import { aggregateReports } from "./aggregation.js";
import { loadWorkerConfig } from "./config.js";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
const config = loadWorkerConfig();
const store = new Store({ databaseUrl: config.databaseUrl });

let shuttingDown = false;

async function runAggregationOnce(): Promise<void> {
  if (!config.databaseUrl) {
    logger.warn("DATABASE_URL is not set; aggregation is disabled");
    return;
  }

  const since = new Date(Date.now() - config.aggregationLookbackMinutes * 60_000);
  const reports = await store.acceptedReportsSince(since);
  const aggregates = aggregateReports(reports, {
    minimumValidReports: config.minimumValidReports,
    minimumDistinctMonitors: config.minimumDistinctMonitors,
    windowSeconds: config.aggregationWindowSeconds,
    latencyOutlierFixedThresholdMs: config.latencyOutlierFixedThresholdMs,
  });

  for (const aggregate of aggregates) {
    await store.upsertAggregateWindow(aggregate);
  }

  logger.info(
    {
      reports: reports.length,
      aggregates: aggregates.length,
      lookbackMinutes: config.aggregationLookbackMinutes,
    },
    "aggregation pass completed"
  );
}

async function main(): Promise<void> {
  logger.info(
    {
      redisUrl: config.redisUrl,
      aggregationIntervalMs: config.aggregationIntervalMs,
      aggregationWindowSeconds: config.aggregationWindowSeconds,
    },
    "worker booted"
  );

  await store.migrate();
  await runAggregationOnce();

  const interval = setInterval(() => {
    runAggregationOnce().catch((error: unknown) => {
      logger.error({ error }, "aggregation pass failed");
    });
  }, config.aggregationIntervalMs);

  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    clearInterval(interval);
    logger.info({ signal }, "worker shutting down");
    await store.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => {
    shutdown("SIGTERM").catch((error: unknown) => {
      logger.error({ error }, "worker shutdown failed");
      process.exit(1);
    });
  });

  process.on("SIGINT", () => {
    shutdown("SIGINT").catch((error: unknown) => {
      logger.error({ error }, "worker shutdown failed");
      process.exit(1);
    });
  });
}

main().catch((error: unknown) => {
  logger.error({ error }, "worker failed");
  process.exit(1);
});
