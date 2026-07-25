import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import Fastify from "fastify";

import type { ApiConfig } from "./config.js";
import {
  endpointRegistrationSchema,
  heartbeatSchema,
  jobRegistrationSchema,
  monitorRegistrationSchema,
  reportEnvelopeSchema,
} from "./schemas.js";
import { validateReportEnvelope, validateReportFreshness } from "./report-validation.js";
import type { Store } from "./store.js";

export interface AppOptions {
  config: ApiConfig;
  store: Store;
}

export function buildApp(options: AppOptions) {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  const counters = {
    reportsReceived: 0,
    reportsAccepted: 0,
    reportsRejected: 0,
    heartbeatsReceived: 0,
  };

  app.addHook("onClose", async () => {
    await options.store.close();
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

  app.get("/readyz", async (_request, reply) => {
    try {
      const db = await options.store.health();
      return {
        ok: true,
        database: db.connected ? "connected" : "disabled",
      };
    } catch (error) {
      return reply.code(503).send({
        ok: false,
        database: "unavailable",
        error: error instanceof Error ? error.message : "unknown_error",
      });
    }
  });

  app.get("/summary", async () => options.store.summary());

  app.get("/metrics", async (_request, reply) => {
    const summary = await options.store.summary();
    const lines = [
      "# HELP rpc_sla_reports_received_total Reports received by the API process.",
      "# TYPE rpc_sla_reports_received_total counter",
      `rpc_sla_reports_received_total ${counters.reportsReceived}`,
      "# HELP rpc_sla_reports_accepted_total Reports accepted by the API process.",
      "# TYPE rpc_sla_reports_accepted_total counter",
      `rpc_sla_reports_accepted_total ${counters.reportsAccepted}`,
      "# HELP rpc_sla_reports_rejected_total Reports rejected by the API process.",
      "# TYPE rpc_sla_reports_rejected_total counter",
      `rpc_sla_reports_rejected_total ${counters.reportsRejected}`,
      "# HELP rpc_sla_heartbeats_received_total Monitor heartbeats received by the API process.",
      "# TYPE rpc_sla_heartbeats_received_total counter",
      `rpc_sla_heartbeats_received_total ${counters.heartbeatsReceived}`,
      "# HELP rpc_sla_monitors_total Monitors stored in PostgreSQL.",
      "# TYPE rpc_sla_monitors_total gauge",
      `rpc_sla_monitors_total ${summary.monitors}`,
      "# HELP rpc_sla_endpoints_total Endpoints stored in PostgreSQL.",
      "# TYPE rpc_sla_endpoints_total gauge",
      `rpc_sla_endpoints_total ${summary.endpoints}`,
      "# HELP rpc_sla_reports_stored_total Reports stored in PostgreSQL.",
      "# TYPE rpc_sla_reports_stored_total gauge",
      `rpc_sla_reports_stored_total ${summary.reports}`,
      "",
    ];

    return reply.type("text/plain; version=0.0.4").send(lines.join("\n"));
  });

  app.post("/monitors/register", async (request, reply) => {
    const authError = authenticateMonitorRequest(request.headers.authorization, options.config);
    if (authError) {
      return reply.code(401).send({ ok: false, error: authError });
    }

    const parsed = monitorRegistrationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "invalid_monitor_registration" });
    }

    await options.store.registerMonitor(parsed.data);

    request.log.info(
      { monitorId: parsed.data.monitorId, region: parsed.data.region },
      "monitor registered"
    );

    return reply.code(201).send({
      ok: true,
      monitorId: parsed.data.monitorId,
    });
  });

  app.post("/endpoints", async (request, reply) => {
    const parsed = endpointRegistrationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "invalid_endpoint" });
    }

    await options.store.registerEndpoint(parsed.data);

    return reply.code(201).send({
      ok: true,
      endpointId: parsed.data.id,
    });
  });

  app.post("/measurement-jobs", async (request, reply) => {
    const parsed = jobRegistrationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "invalid_measurement_job" });
    }

    await options.store.registerJob(parsed.data);

    return reply.code(201).send({
      ok: true,
      jobId: parsed.data.id,
    });
  });

  app.get("/monitors/me/jobs", async (request, reply) => {
    const monitorId = request.headers["x-monitor-id"];
    if (typeof monitorId !== "string" || monitorId.length === 0) {
      return reply.code(400).send({ ok: false, error: "missing_monitor_id" });
    }

    const jobs = await options.store.listMonitorJobs(monitorId);
    return { ok: true, jobs };
  });

  app.post("/monitors/heartbeat", async (request, reply) => {
    const authError = authenticateMonitorRequest(request.headers.authorization, options.config);
    if (authError) {
      return reply.code(401).send({ ok: false, error: authError });
    }

    const parsed = heartbeatSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: "invalid_heartbeat",
      });
    }

    counters.heartbeatsReceived++;
    await options.store.recordHeartbeat(parsed.data);

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
    const authError = authenticateMonitorRequest(request.headers.authorization, options.config);
    if (authError) {
      return reply.code(401).send({ ok: false, error: authError });
    }

    const parsed = reportEnvelopeSchema.safeParse(request.body);
    if (!parsed.success) {
      counters.reportsRejected++;
      return reply.code(400).send({
        ok: false,
        error: "invalid_report",
      });
    }

    counters.reportsReceived++;

    const envelope = parsed.data;
    let rejectionReason = validateReportFreshness(
      new Date(),
      envelope.payload.startedAt,
      options.config.maxReportAgeMs,
      options.config.maxReportFutureSkewMs
    );

    if (!rejectionReason && (await options.store.reportExists(envelope.payload.reportId))) {
      rejectionReason = "duplicate_report_id";
    }

    if (
      !rejectionReason &&
      (await options.store.nonceExists(envelope.payload.monitorId, envelope.payload.nonce))
    ) {
      rejectionReason = "reused_nonce";
    }

    if (
      !rejectionReason &&
      options.config.strictJobValidation &&
      !(await options.store.jobExists(
        envelope.payload.monitorId,
        envelope.payload.endpointId,
        envelope.payload.checkType
      ))
    ) {
      rejectionReason = "missing_active_job_assignment";
    }

    const signatureValidation = await validateReportEnvelope(envelope);
    if (!rejectionReason && !signatureValidation.accepted) {
      rejectionReason = signatureValidation.rejectionReason;
    }

    const accepted = !rejectionReason;

    await options.store.storeReport({
      envelope,
      accepted,
      rejectionReason,
      recoveredAddress: signatureValidation.recoveredAddress,
    });

    if (accepted) {
      counters.reportsAccepted++;
    } else {
      counters.reportsRejected++;
    }

    request.log.info(
      {
        reportId: envelope.payload.reportId,
        monitorId: envelope.payload.monitorId,
        checkType: envelope.payload.checkType,
        accepted,
        rejectionReason,
      },
      "monitor report processed"
    );

    return reply.code(accepted ? 202 : 422).send({
      ok: accepted,
      accepted,
      reportId: envelope.payload.reportId,
      rejectionReason,
    });
  });

  return app;
}

function authenticateMonitorRequest(
  authorizationHeader: string | undefined,
  config: ApiConfig
): string | undefined {
  if (!config.monitorApiKey) {
    return undefined;
  }

  const expected = `Bearer ${config.monitorApiKey}`;
  if (authorizationHeader !== expected) {
    return "invalid_monitor_api_key";
  }

  return undefined;
}
