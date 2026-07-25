import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import Fastify from "fastify";
import { z } from "zod";

const heartbeatSchema = z.object({
  monitorId: z.string().min(1),
  region: z.string().min(1),
  country: z.string().min(1),
  cloudProvider: z.string().min(1),
  asn: z.string().min(1),
  softwareVersion: z.string().min(1),
});

const reportEnvelopeSchema = z.object({
  payload: z.object({
    reportId: z.string().min(1),
    monitorId: z.string().min(1),
    endpointId: z.string().min(1),
    checkType: z.string().min(1),
    nonce: z.number().int().nonnegative(),
  }),
  payloadHash: z.string().min(1),
  signature: z.string().min(1),
});

export function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  app.register(cors, {
    origin: true,
  });

  app.register(swagger, {
    openapi: {
      info: {
        title: "RPC SLA Platform API",
        version: "0.1.0",
      },
    },
  });

  app.get("/healthz", async () => ({
    ok: true,
    service: "api",
    version: "0.1.0",
  }));

  app.get("/readyz", async () => ({
    ok: true,
  }));

  app.post("/monitors/heartbeat", async (request, reply) => {
    const parsed = heartbeatSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: "invalid_heartbeat",
      });
    }

    request.log.info(
      {
        monitorId: parsed.data.monitorId,
        region: parsed.data.region,
        softwareVersion: parsed.data.softwareVersion,
      },
      "monitor heartbeat received"
    );

    return {
      ok: true,
      monitorId: parsed.data.monitorId,
    };
  });

  app.post("/monitors/reports", async (request, reply) => {
    const parsed = reportEnvelopeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: "invalid_report",
      });
    }

    request.log.info(
      {
        reportId: parsed.data.payload.reportId,
        monitorId: parsed.data.payload.monitorId,
        checkType: parsed.data.payload.checkType,
      },
      "monitor report received"
    );

    return reply.code(202).send({
      ok: true,
      accepted: true,
      reportId: parsed.data.payload.reportId,
    });
  });

  return app;
}
