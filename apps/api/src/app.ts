import { randomUUID } from "node:crypto";

import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import Fastify from "fastify";
import { buildMerkleTree, getMerkleProof, verifyMerkleProof } from "@rpc-sla/merkle";
import { slaTermsHash } from "@rpc-sla/sla";

import type { ApiConfig } from "./config.js";
import {
  endpointRegistrationSchema,
  heartbeatSchema,
  jobRegistrationSchema,
  monitorRegistrationSchema,
  reportEnvelopeSchema,
  slaCreateSchema,
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

  app.get("/providers", async (request) => {
    const limit = parseLimit(request.query, 50, 200);
    const providers = await options.store.providerDirectory(limit);
    return { ok: true, providers };
  });

  app.get("/endpoints/performance", async (request) => {
    const limit = parseLimit(request.query, 50, 200);
    const endpoints = await options.store.endpointPerformance(limit);
    return { ok: true, endpoints };
  });

  app.get("/monitors", async (request) => {
    const limit = parseLimit(request.query, 50, 200);
    const monitors = await options.store.monitorHealth(limit);
    return { ok: true, monitors };
  });

  app.get("/reports", async (request) => {
    const limit = parseLimit(request.query, 50, 200);
    const reports = await options.store.recentReports(limit);
    return { ok: true, reports };
  });

  app.get("/aggregates", async (request) => {
    const safeLimit = parseLimit(request.query, 50, 500);
    const aggregates = await options.store.recentAggregateWindows(safeLimit);
    return { ok: true, aggregates };
  });

  app.get("/report-batches", async (request) => {
    const safeLimit = parseLimit(request.query, 50, 500);
    const batches = await options.store.recentReportBatches(safeLimit);
    return { ok: true, batches };
  });

  app.get("/report-batches/:batchId", async (request, reply) => {
    const { batchId } = request.params as { batchId: string };
    const batch = await options.store.reportBatch(batchId);
    if (!batch) {
      return reply.code(404).send({ ok: false, error: "batch_not_found" });
    }
    return { ok: true, batch };
  });

  app.post("/slas", async (request, reply) => {
    const parsed = slaCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "invalid_sla", issues: parsed.error.issues });
    }

    const terms = { ...parsed.data, id: parsed.data.id ?? randomUUID() };
    try {
      const sla = await options.store.createSla({
        ...terms,
        termsHash: slaTermsHash(terms),
      });
      return reply.code(201).send({ ok: true, sla });
    } catch (error) {
      request.log.warn({ error, slaId: terms.id }, "SLA creation failed");
      return reply.code(409).send({ ok: false, error: "sla_conflict_or_unknown_endpoint" });
    }
  });

  app.get("/slas", async (request) => {
    const limit = parseLimit(request.query, 50, 200);
    return { ok: true, slas: await options.store.recentSlas(limit) };
  });

  app.get("/slas/:slaId", async (request, reply) => {
    const { slaId } = request.params as { slaId: string };
    const sla = await options.store.sla(slaId);
    if (!sla) return reply.code(404).send({ ok: false, error: "sla_not_found" });
    return { ok: true, sla };
  });

  app.get("/slas/:slaId/report", async (request, reply) => {
    const { slaId } = request.params as { slaId: string };
    const sla = await options.store.sla(slaId);
    if (!sla?.evaluation) {
      return reply.code(404).send({ ok: false, error: "sla_evaluation_not_found" });
    }
    const proofData = await options.store.slaEvaluationProofData(sla.evaluation.evaluationId);
    const report = {
      format: "rpc-sla-evaluation-v1",
      generatedAt: new Date().toISOString(),
      sla,
      evidence: proofData?.evidence ?? [],
      verification: {
        termsHash: sla.termsHash,
        evidenceRoot: sla.evaluation.evidenceRoot,
        evaluationTransactionHash: sla.evaluation.txHash,
      },
    };
    return reply
      .header("content-disposition", `attachment; filename="sla-${safeFilename(slaId)}.json"`)
      .type("application/json")
      .send(report);
  });

  app.get("/sla-evaluations/:evaluationId/proof", async (request, reply) => {
    const { evaluationId } = request.params as { evaluationId: string };
    const proofData = await options.store.slaEvaluationProofData(evaluationId);
    if (!proofData) {
      return reply.code(404).send({ ok: false, error: "sla_evaluation_not_found" });
    }
    const leaves = proofData.evidence.map((item) => item.leafHash);
    const tree = buildMerkleTree(leaves);
    const proofs = proofData.evidence.map((item) => {
      const proof = getMerkleProof(tree, item.leafHash);
      return {
        leafIndex: item.leafIndex,
        leaf: item.leafHash,
        proof,
        verified: verifyMerkleProof(item.leafHash, proof, proofData.evaluation.evidenceRoot),
      };
    });
    return {
      ok: true,
      evaluation: proofData.evaluation,
      evidence: proofData.evidence,
      proofs,
      verified:
        tree.root === proofData.evaluation.evidenceRoot && proofs.every((item) => item.verified),
    };
  });

  app.get("/reports/:reportId/proof", async (request, reply) => {
    const { reportId } = request.params as { reportId: string };
    const proofData = await options.store.reportProofData(reportId);
    if (!proofData) {
      return reply.code(404).send({ ok: false, error: "report_proof_not_found" });
    }

    const tree = buildMerkleTree(proofData.leaves);
    const proof = getMerkleProof(tree, proofData.report.leafHash);

    return {
      ok: true,
      reportId,
      batchId: proofData.batch.batchId,
      merkleRoot: proofData.batch.merkleRoot,
      leaf: proofData.report.leafHash,
      proof,
      verified: verifyMerkleProof(proofData.report.leafHash, proof, proofData.batch.merkleRoot),
    };
  });

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
      "# HELP rpc_sla_aggregate_windows_total Aggregate windows stored in PostgreSQL.",
      "# TYPE rpc_sla_aggregate_windows_total gauge",
      `rpc_sla_aggregate_windows_total ${summary.aggregateWindows}`,
      "# HELP rpc_sla_report_batches_total Report Merkle batches stored in PostgreSQL.",
      "# TYPE rpc_sla_report_batches_total gauge",
      `rpc_sla_report_batches_total ${summary.reportBatches}`,
      "# HELP rpc_sla_definitions_total SLA definitions stored in PostgreSQL.",
      "# TYPE rpc_sla_definitions_total gauge",
      `rpc_sla_definitions_total ${summary.slas}`,
      "# HELP rpc_sla_evaluations_total SLA evaluations stored in PostgreSQL.",
      "# TYPE rpc_sla_evaluations_total gauge",
      `rpc_sla_evaluations_total ${summary.slaEvaluations}`,
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

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/gu, "-");
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

function parseLimit(query: unknown, fallback: number, max: number): number {
  const raw = (query as { limit?: string } | undefined)?.limit;
  const limit = Number(raw ?? fallback);
  return Number.isFinite(limit) ? Math.min(Math.max(limit, 1), max) : fallback;
}
