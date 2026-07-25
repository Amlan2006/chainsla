import { z } from "zod";

const configSchema = z.object({
  host: z.string().default("0.0.0.0"),
  port: z.coerce.number().int().positive().default(4000),
  nodeEnv: z.string().default("development"),
  databaseUrl: z.string().optional(),
  monitorApiKey: z.string().optional(),
  strictJobValidation: z.coerce.boolean().default(false),
  maxReportAgeMs: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 60 * 1000),
  maxReportFutureSkewMs: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 1000),
});

export type ApiConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return configSchema.parse({
    host: env.API_HOST,
    port: env.API_PORT,
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
    monitorApiKey: env.MONITOR_API_KEY,
    strictJobValidation: env.STRICT_JOB_VALIDATION,
    maxReportAgeMs: env.MAX_REPORT_AGE_MS,
    maxReportFutureSkewMs: env.MAX_REPORT_FUTURE_SKEW_MS,
  });
}
