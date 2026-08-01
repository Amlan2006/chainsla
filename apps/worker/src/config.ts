import { z } from "zod";

const workerConfigSchema = z.object({
  databaseUrl: z.string().optional(),
  redisUrl: z.string().default("redis://localhost:6379"),
  nodeEnv: z.string().default("development"),
  aggregationIntervalMs: z.coerce.number().int().positive().default(30_000),
  aggregationLookbackMinutes: z.coerce.number().int().positive().default(60),
  aggregationWindowSeconds: z.coerce.number().int().positive().default(60),
  minimumValidReports: z.coerce.number().int().positive().default(2),
  minimumDistinctMonitors: z.coerce.number().int().positive().default(1),
  latencyOutlierFixedThresholdMs: z.coerce.number().int().positive().default(1_000),
  commitmentBatchSize: z.coerce.number().int().positive().default(100),
  reportCommitmentContract: z.string().optional(),
  publisherPrivateKey: z.string().optional(),
  chainRpcUrl: z.string().optional(),
  chainId: z.coerce.number().int().positive().default(84532),
});

export type WorkerConfig = z.infer<typeof workerConfigSchema>;

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return workerConfigSchema.parse({
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    nodeEnv: env.NODE_ENV,
    aggregationIntervalMs: env.AGGREGATION_INTERVAL_MS,
    aggregationLookbackMinutes: env.AGGREGATION_LOOKBACK_MINUTES,
    aggregationWindowSeconds: env.AGGREGATION_WINDOW_SECONDS,
    minimumValidReports: env.MINIMUM_VALID_REPORTS,
    minimumDistinctMonitors: env.MINIMUM_DISTINCT_MONITORS,
    latencyOutlierFixedThresholdMs: env.LATENCY_OUTLIER_FIXED_THRESHOLD_MS,
    commitmentBatchSize: env.COMMITMENT_BATCH_SIZE,
    reportCommitmentContract: env.REPORT_COMMITMENT_CONTRACT,
    publisherPrivateKey: env.PUBLISHER_PRIVATE_KEY,
    chainRpcUrl: env.BASE_SEPOLIA_RPC_URL,
    chainId: env.NEXT_PUBLIC_CHAIN_ID,
  });
}
