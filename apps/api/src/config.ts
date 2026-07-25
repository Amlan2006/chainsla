import { z } from "zod";

const configSchema = z.object({
  host: z.string().default("0.0.0.0"),
  port: z.coerce.number().int().positive().default(4000),
  nodeEnv: z.string().default("development"),
});

export type ApiConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return configSchema.parse({
    host: env.API_HOST,
    port: env.API_PORT,
    nodeEnv: env.NODE_ENV,
  });
}
