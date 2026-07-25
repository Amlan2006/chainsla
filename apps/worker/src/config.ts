import { z } from "zod";

const workerConfigSchema = z.object({
  redisUrl: z.string().default("redis://localhost:6379"),
  nodeEnv: z.string().default("development"),
});

export type WorkerConfig = z.infer<typeof workerConfigSchema>;

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return workerConfigSchema.parse({
    redisUrl: env.REDIS_URL,
    nodeEnv: env.NODE_ENV,
  });
}
