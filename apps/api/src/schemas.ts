import { z } from "zod";

export const heartbeatSchema = z.object({
  monitorId: z.string().min(1),
  region: z.string().min(1),
  country: z.string().min(1),
  cloudProvider: z.string().min(1),
  asn: z.string().min(1),
  softwareVersion: z.string().min(1),
});

export const monitorRegistrationSchema = heartbeatSchema.extend({
  walletAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/u)
    .optional(),
  publicKey: z.string().optional(),
});

export const endpointRegistrationSchema = z.object({
  id: z.string().min(1),
  providerId: z.string().min(1).default("local-provider"),
  providerName: z.string().min(1).default("Local Provider"),
  chainId: z.number().int().positive(),
  networkName: z.string().min(1),
  isPublic: z.boolean().default(false),
});

export const jobRegistrationSchema = z.object({
  id: z.string().min(1),
  endpointId: z.string().min(1),
  monitorId: z.string().min(1),
  checkType: z.string().min(1),
  chainId: z.number().int().positive(),
  intervalSeconds: z.number().int().positive(),
  timeoutMs: z.number().int().positive(),
});

export const reportPayloadSchema = z.object({
  protocolVersion: z.string().min(1),
  reportId: z.string().min(1),
  monitorId: z.string().min(1),
  endpointId: z.string().min(1),
  chainId: z.number().int().positive(),
  checkType: z.string().min(1),
  measurementWindow: z.number().int(),
  startedAt: z.number().int(),
  finishedAt: z.number().int(),
  latencyMs: z.number().int().nonnegative(),
  success: z.boolean(),
  errorCategory: z.string().optional(),
  errorCode: z.string().optional(),
  rpcMethod: z.string().optional(),
  resultHash: z.string().optional(),
  blockNumber: z.number().int().nonnegative().optional(),
  nonce: z.number().int().nonnegative(),
  softwareVersion: z.string().min(1),
});

export const reportEnvelopeSchema = z.object({
  payload: reportPayloadSchema,
  payloadHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/u),
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/u),
});

export type Heartbeat = z.infer<typeof heartbeatSchema>;
export type MonitorRegistration = z.infer<typeof monitorRegistrationSchema>;
export type EndpointRegistration = z.infer<typeof endpointRegistrationSchema>;
export type JobRegistration = z.infer<typeof jobRegistrationSchema>;
export type ReportEnvelope = z.infer<typeof reportEnvelopeSchema>;
export type ReportPayload = z.infer<typeof reportPayloadSchema>;
