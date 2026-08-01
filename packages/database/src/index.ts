import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Pool } = pg;

export interface DatabaseConfig {
  databaseUrl: string;
}

export interface StoreConfig {
  databaseUrl?: string;
}

export interface StoreHealth {
  connected: boolean;
}

export interface MonitorRegistration {
  monitorId: string;
  region: string;
  country: string;
  cloudProvider: string;
  asn: string;
  softwareVersion: string;
  walletAddress?: string;
  publicKey?: string;
}

export interface Heartbeat {
  monitorId: string;
  region: string;
  country: string;
  cloudProvider: string;
  asn: string;
  softwareVersion: string;
}

export interface EndpointRegistration {
  id: string;
  providerId: string;
  providerName: string;
  chainId: number;
  networkName: string;
  isPublic: boolean;
}

export interface JobRegistration {
  id: string;
  endpointId: string;
  monitorId: string;
  checkType: string;
  chainId: number;
  intervalSeconds: number;
  timeoutMs: number;
}

export interface ReportPayload {
  reportId: string;
  monitorId: string;
  endpointId: string;
  checkType: string;
  measurementWindow: number;
  startedAt: number;
  finishedAt: number;
  latencyMs: number;
  success: boolean;
  errorCategory?: string;
  errorCode?: string;
  rpcMethod?: string;
  resultHash?: string;
  blockNumber?: number;
  nonce: number;
}

export interface ReportEnvelope {
  payload: ReportPayload;
  payloadHash: string;
  signature: string;
}

export interface ReportInsert {
  envelope: ReportEnvelope;
  accepted: boolean;
  rejectionReason?: string;
  recoveredAddress?: string;
}

export interface AcceptedReportRow {
  reportId: string;
  monitorId: string;
  endpointId: string;
  checkType: string;
  measurementWindow: number;
  latencyMs: number;
  success: boolean;
  blockNumber?: number;
}

export interface AggregateWindowInsert {
  endpointId: string;
  checkType: string;
  windowStart: number;
  windowEnd: number;
  monitorCount: number;
  validReportCount: number;
  successRate: number;
  errorRate: number;
  medianLatencyMs?: number;
  p50LatencyMs?: number;
  p95LatencyMs?: number;
  p99LatencyMs?: number;
  medianBlockNumber?: number;
  medianBlockDelay?: number;
  status: string;
  excludedReportCount: number;
  metadata: Record<string, unknown>;
}

export interface ProviderDirectoryItem {
  providerId: string;
  name: string;
  endpointCount: number;
  bestStatus: string;
  averageSuccessRate?: number;
  medianLatencyMs?: number;
  p95LatencyMs?: number;
}

export interface EndpointPerformanceItem {
  endpointId: string;
  providerName?: string;
  networkName?: string;
  latestStatus: string;
  checkCount: number;
  monitorCount: number;
  successRate?: number;
  errorRate?: number;
  medianLatencyMs?: number;
  p95LatencyMs?: number;
  latestBlockNumber?: number;
  windowStart?: number;
  windowEnd?: number;
}

export interface MonitorHealthItem {
  id: string;
  region: string;
  country: string;
  cloudProvider: string;
  asn: string;
  status: string;
  softwareVersion?: string;
  lastSeenAt?: string;
  reportCount: number;
  acceptedReportCount: number;
}

export interface RecentReportItem {
  reportId: string;
  monitorId: string;
  endpointId: string;
  checkType: string;
  latencyMs: number;
  success: boolean;
  accepted: boolean;
  rejectionReason?: string;
  receivedAt: string;
}

export interface CommittableReportRow {
  reportId: string;
  endpointId: string;
  monitorAddress?: `0x${string}`;
  payloadHash: `0x${string}`;
  measurementWindow: number;
}

export interface ReportBatchInsert {
  batchId: string;
  merkleRoot: `0x${string}`;
  startWindow: number;
  endWindow: number;
  reportCount: number;
  reports: Array<{
    reportId: string;
    leafIndex: number;
    leafHash: `0x${string}`;
  }>;
}

export interface ReportBatchItem {
  batchId: string;
  merkleRoot: `0x${string}`;
  startWindow: number;
  endWindow: number;
  reportCount: number;
  status: string;
  txHash?: string;
  createdAt: string;
  publishedAt?: string;
}

export interface ReportProofData {
  batch: ReportBatchItem;
  leaves: `0x${string}`[];
  report: {
    reportId: string;
    leafHash: `0x${string}`;
    leafIndex: number;
  };
}

export interface SlaCreate {
  id: string;
  providerId: string;
  customerId: string;
  providerAddress?: string;
  customerAddress?: string;
  endpointId: string;
  periodStart: number;
  periodEnd: number;
  minimumUptime: number;
  maximumP95LatencyMs?: number;
  maximumErrorRate?: number;
  maximumBlockDelay?: number;
  termsHash: `0x${string}`;
}

export interface SlaItem extends SlaCreate {
  status: string;
  registrationTxHash?: string;
  createdAt: string;
  evaluation?: SlaEvaluationItem;
}

export interface SlaAggregateEvidenceRow {
  endpointId: string;
  checkType: string;
  windowStart: number;
  windowEnd: number;
  validReportCount: number;
  successRate: number;
  errorRate: number;
  p95LatencyMs?: number;
  medianBlockDelay?: number;
  status: string;
}

export interface SlaEvaluationInsert {
  evaluationId: string;
  slaId: string;
  outcome: string;
  evidenceRoot: `0x${string}`;
  aggregateCount: number;
  metrics: Record<string, unknown>;
  reasons: string[];
  evidence: Array<SlaAggregateEvidenceRow & { leafIndex: number; leafHash: `0x${string}` }>;
}

export interface SlaEvaluationItem {
  evaluationId: string;
  slaId: string;
  outcome: string;
  evidenceRoot: `0x${string}`;
  aggregateCount: number;
  metrics: Record<string, unknown>;
  reasons: string[];
  txHash?: string;
  evaluatedAt: string;
  publishedAt?: string;
}

export interface SlaEvaluationProofData {
  evaluation: SlaEvaluationItem;
  evidence: Array<SlaAggregateEvidenceRow & { leafIndex: number; leafHash: `0x${string}` }>;
}

export function loadDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const databaseUrl = env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  return { databaseUrl };
}

export class Store {
  private readonly pool?: pg.Pool;

  constructor(config: StoreConfig) {
    if (config.databaseUrl) {
      this.pool = new Pool({ connectionString: config.databaseUrl });
    }
  }

  async close(): Promise<void> {
    await this.pool?.end();
  }

  async migrate(): Promise<void> {
    if (!this.pool) {
      return;
    }

    const migrationPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../migrations/0001_initial.sql"
    );
    const sql = await readFile(migrationPath, "utf8");
    await this.pool.query(sql);
  }

  async health(): Promise<StoreHealth> {
    if (!this.pool) {
      return { connected: false };
    }

    await this.pool.query("SELECT 1");
    return { connected: true };
  }

  async registerMonitor(input: MonitorRegistration): Promise<void> {
    if (!this.pool) {
      return;
    }

    await this.pool.query(
      `
      INSERT INTO monitors (
        id, wallet_address, public_key, region, country, cloud_provider, asn,
        software_version, last_seen_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
      ON CONFLICT (id) DO UPDATE SET
        wallet_address = COALESCE(EXCLUDED.wallet_address, monitors.wallet_address),
        public_key = COALESCE(EXCLUDED.public_key, monitors.public_key),
        region = EXCLUDED.region,
        country = EXCLUDED.country,
        cloud_provider = EXCLUDED.cloud_provider,
        asn = EXCLUDED.asn,
        software_version = EXCLUDED.software_version,
        last_seen_at = now(),
        updated_at = now()
      `,
      [
        input.monitorId,
        input.walletAddress?.toLowerCase(),
        input.publicKey,
        input.region,
        input.country,
        input.cloudProvider,
        input.asn,
        input.softwareVersion,
      ]
    );
  }

  async recordHeartbeat(input: Heartbeat): Promise<void> {
    if (!this.pool) {
      return;
    }

    await this.pool.query(
      `
      INSERT INTO monitors (
        id, region, country, cloud_provider, asn, software_version, last_seen_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, now(), now())
      ON CONFLICT (id) DO UPDATE SET
        region = EXCLUDED.region,
        country = EXCLUDED.country,
        cloud_provider = EXCLUDED.cloud_provider,
        asn = EXCLUDED.asn,
        software_version = EXCLUDED.software_version,
        last_seen_at = now(),
        updated_at = now()
      `,
      [
        input.monitorId,
        input.region,
        input.country,
        input.cloudProvider,
        input.asn,
        input.softwareVersion,
      ]
    );
  }

  async registerEndpoint(input: EndpointRegistration): Promise<void> {
    if (!this.pool) {
      return;
    }

    await this.pool.query(
      `
      INSERT INTO providers (id, name, status, updated_at)
      VALUES ($1, $2, 'active', now())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        updated_at = now()
      `,
      [input.providerId, input.providerName]
    );

    await this.pool.query(
      `
      INSERT INTO rpc_endpoints (id, provider_id, chain_id, network_name, is_public, status, updated_at)
      VALUES ($1, $2, $3, $4, $5, 'active', now())
      ON CONFLICT (id) DO UPDATE SET
        provider_id = EXCLUDED.provider_id,
        chain_id = EXCLUDED.chain_id,
        network_name = EXCLUDED.network_name,
        is_public = EXCLUDED.is_public,
        updated_at = now()
      `,
      [input.id, input.providerId, input.chainId, input.networkName, input.isPublic]
    );
  }

  async registerJob(input: JobRegistration): Promise<void> {
    if (!this.pool) {
      return;
    }

    await this.pool.query(
      `
      INSERT INTO measurement_jobs (
        id, endpoint_id, monitor_id, check_type, chain_id, interval_seconds, timeout_ms, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, now())
      ON CONFLICT (endpoint_id, monitor_id, check_type) DO UPDATE SET
        chain_id = EXCLUDED.chain_id,
        interval_seconds = EXCLUDED.interval_seconds,
        timeout_ms = EXCLUDED.timeout_ms,
        status = 'active',
        updated_at = now()
      `,
      [
        input.id,
        input.endpointId,
        input.monitorId,
        input.checkType,
        input.chainId,
        input.intervalSeconds,
        input.timeoutMs,
      ]
    );
  }

  async reportExists(reportId: string): Promise<boolean> {
    if (!this.pool) {
      return false;
    }

    const result = await this.pool.query(
      "SELECT 1 FROM monitoring_reports WHERE report_uuid = $1",
      [reportId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async nonceExists(monitorId: string, nonce: number): Promise<boolean> {
    if (!this.pool) {
      return false;
    }

    const result = await this.pool.query(
      "SELECT 1 FROM monitoring_reports WHERE monitor_id = $1 AND nonce = $2",
      [monitorId, nonce]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async jobExists(monitorId: string, endpointId: string, checkType: string): Promise<boolean> {
    if (!this.pool) {
      return true;
    }

    const result = await this.pool.query(
      `
      SELECT 1
      FROM measurement_jobs
      WHERE monitor_id = $1
        AND endpoint_id = $2
        AND check_type = $3
        AND status = 'active'
        AND (assignment_end IS NULL OR assignment_end > now())
      `,
      [monitorId, endpointId, checkType]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listMonitorJobs(monitorId: string): Promise<
    Array<{
      id: string;
      endpointId: string;
      checkType: string;
      chainId: number;
      intervalSeconds: number;
      timeoutMs: number;
      configuration: unknown;
    }>
  > {
    if (!this.pool) {
      return [];
    }

    const result = await this.pool.query<{
      id: string;
      endpoint_id: string;
      check_type: string;
      chain_id: string;
      interval_seconds: number;
      timeout_ms: number;
      configuration_json: unknown;
    }>(
      `
      SELECT id, endpoint_id, check_type, chain_id::text, interval_seconds, timeout_ms, configuration_json
      FROM measurement_jobs
      WHERE monitor_id = $1
        AND status = 'active'
        AND (assignment_end IS NULL OR assignment_end > now())
      ORDER BY endpoint_id, check_type
      `,
      [monitorId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      endpointId: row.endpoint_id,
      checkType: row.check_type,
      chainId: Number(row.chain_id),
      intervalSeconds: row.interval_seconds,
      timeoutMs: row.timeout_ms,
      configuration: row.configuration_json,
    }));
  }

  async storeReport(input: ReportInsert): Promise<void> {
    if (!this.pool) {
      return;
    }

    const { payload } = input.envelope;

    await this.pool.query(
      `
      INSERT INTO monitoring_reports (
        report_uuid, monitor_id, endpoint_id, check_type, measurement_window,
        request_started_at, request_finished_at, latency_ms, success, error_code,
        error_category, rpc_method, rpc_result_hash, block_number, nonce, signature,
        payload_hash, recovered_address, payload_json, accepted, rejection_reason
      )
      VALUES (
        $1, $2, $3, $4, $5,
        to_timestamp($6::double precision / 1000), to_timestamp($7::double precision / 1000),
        $8, $9, $10,
        $11, $12, $13, $14, $15, $16,
        $17, $18, $19::jsonb, $20, $21
      )
      ON CONFLICT (report_uuid) DO NOTHING
      `,
      [
        payload.reportId,
        payload.monitorId,
        payload.endpointId,
        payload.checkType,
        payload.measurementWindow,
        payload.startedAt,
        payload.finishedAt,
        payload.latencyMs,
        payload.success,
        payload.errorCode,
        payload.errorCategory,
        payload.rpcMethod,
        payload.resultHash,
        payload.blockNumber,
        payload.nonce,
        input.envelope.signature,
        input.envelope.payloadHash,
        input.recoveredAddress,
        JSON.stringify(payload),
        input.accepted,
        input.rejectionReason,
      ]
    );
  }

  async acceptedReportsSince(since: Date): Promise<AcceptedReportRow[]> {
    if (!this.pool) {
      return [];
    }

    const result = await this.pool.query<{
      report_uuid: string;
      monitor_id: string;
      endpoint_id: string;
      check_type: string;
      measurement_window: string;
      latency_ms: string;
      success: boolean;
      block_number: string | null;
    }>(
      `
      SELECT
        report_uuid,
        monitor_id,
        endpoint_id,
        check_type,
        measurement_window::text,
        latency_ms::text,
        success,
        block_number::text
      FROM monitoring_reports
      WHERE accepted
        AND received_at >= $1
      ORDER BY endpoint_id, check_type, measurement_window
      `,
      [since]
    );

    return result.rows.map((row) => ({
      reportId: row.report_uuid,
      monitorId: row.monitor_id,
      endpointId: row.endpoint_id,
      checkType: row.check_type,
      measurementWindow: Number(row.measurement_window),
      latencyMs: Number(row.latency_ms),
      success: row.success,
      blockNumber: row.block_number === null ? undefined : Number(row.block_number),
    }));
  }

  async upsertAggregateWindow(input: AggregateWindowInsert): Promise<void> {
    if (!this.pool) {
      return;
    }

    await this.pool.query(
      `
      INSERT INTO aggregate_windows (
        endpoint_id, check_type, window_start, window_end, monitor_count,
        valid_report_count, success_rate, error_rate, median_latency_ms,
        p50_latency_ms, p95_latency_ms, p99_latency_ms, median_block_number,
        median_block_delay, status, excluded_report_count, metadata_json, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15, $16, $17::jsonb, now()
      )
      ON CONFLICT (endpoint_id, check_type, window_start) DO UPDATE SET
        window_end = EXCLUDED.window_end,
        monitor_count = EXCLUDED.monitor_count,
        valid_report_count = EXCLUDED.valid_report_count,
        success_rate = EXCLUDED.success_rate,
        error_rate = EXCLUDED.error_rate,
        median_latency_ms = EXCLUDED.median_latency_ms,
        p50_latency_ms = EXCLUDED.p50_latency_ms,
        p95_latency_ms = EXCLUDED.p95_latency_ms,
        p99_latency_ms = EXCLUDED.p99_latency_ms,
        median_block_number = EXCLUDED.median_block_number,
        median_block_delay = EXCLUDED.median_block_delay,
        status = EXCLUDED.status,
        excluded_report_count = EXCLUDED.excluded_report_count,
        metadata_json = EXCLUDED.metadata_json,
        updated_at = now()
      `,
      [
        input.endpointId,
        input.checkType,
        input.windowStart,
        input.windowEnd,
        input.monitorCount,
        input.validReportCount,
        input.successRate,
        input.errorRate,
        input.medianLatencyMs,
        input.p50LatencyMs,
        input.p95LatencyMs,
        input.p99LatencyMs,
        input.medianBlockNumber,
        input.medianBlockDelay,
        input.status,
        input.excludedReportCount,
        JSON.stringify(input.metadata),
      ]
    );
  }

  async recentAggregateWindows(limit: number): Promise<AggregateWindowInsert[]> {
    if (!this.pool) {
      return [];
    }

    const result = await this.pool.query<{
      endpoint_id: string;
      check_type: string;
      window_start: string;
      window_end: string;
      monitor_count: number;
      valid_report_count: number;
      success_rate: number;
      error_rate: number;
      median_latency_ms: number | null;
      p50_latency_ms: number | null;
      p95_latency_ms: number | null;
      p99_latency_ms: number | null;
      median_block_number: number | null;
      median_block_delay: number | null;
      status: string;
      excluded_report_count: number;
      metadata_json: Record<string, unknown>;
    }>(
      `
      SELECT
        endpoint_id,
        check_type,
        window_start::text,
        window_end::text,
        monitor_count,
        valid_report_count,
        success_rate,
        error_rate,
        median_latency_ms,
        p50_latency_ms,
        p95_latency_ms,
        p99_latency_ms,
        median_block_number,
        median_block_delay,
        status,
        excluded_report_count,
        metadata_json
      FROM aggregate_windows
      ORDER BY window_start DESC, endpoint_id, check_type
      LIMIT $1
      `,
      [limit]
    );

    return result.rows.map((row) => ({
      endpointId: row.endpoint_id,
      checkType: row.check_type,
      windowStart: Number(row.window_start),
      windowEnd: Number(row.window_end),
      monitorCount: row.monitor_count,
      validReportCount: row.valid_report_count,
      successRate: row.success_rate,
      errorRate: row.error_rate,
      medianLatencyMs: row.median_latency_ms ?? undefined,
      p50LatencyMs: row.p50_latency_ms ?? undefined,
      p95LatencyMs: row.p95_latency_ms ?? undefined,
      p99LatencyMs: row.p99_latency_ms ?? undefined,
      medianBlockNumber: row.median_block_number ?? undefined,
      medianBlockDelay: row.median_block_delay ?? undefined,
      status: row.status,
      excludedReportCount: row.excluded_report_count,
      metadata: row.metadata_json,
    }));
  }

  async providerDirectory(limit: number): Promise<ProviderDirectoryItem[]> {
    if (!this.pool) {
      return [];
    }

    const result = await this.pool.query<{
      provider_id: string;
      name: string;
      endpoint_count: string;
      best_status: string | null;
      average_success_rate: number | null;
      median_latency_ms: number | null;
      p95_latency_ms: number | null;
    }>(
      `
      WITH endpoint_sources AS (
        SELECT e.id AS endpoint_id, e.provider_id, p.name
        FROM rpc_endpoints e
        LEFT JOIN providers p ON p.id = e.provider_id
        UNION
        SELECT DISTINCT aw.endpoint_id, 'unregistered' AS provider_id, 'Unregistered Provider' AS name
        FROM aggregate_windows aw
        WHERE NOT EXISTS (
          SELECT 1 FROM rpc_endpoints e WHERE e.id = aw.endpoint_id
        )
      ),
      latest AS (
        SELECT DISTINCT ON (endpoint_id, check_type)
          endpoint_id,
          check_type,
          status,
          success_rate,
          median_latency_ms,
          p95_latency_ms
        FROM aggregate_windows
        ORDER BY endpoint_id, check_type, window_start DESC
      )
      SELECT
        es.provider_id,
        COALESCE(es.name, es.provider_id) AS name,
        count(DISTINCT es.endpoint_id)::text AS endpoint_count,
        CASE
          WHEN bool_or(latest.status = 'healthy') THEN 'healthy'
          WHEN bool_or(latest.status = 'degraded') THEN 'degraded'
          WHEN bool_or(latest.status = 'down') THEN 'down'
          WHEN bool_or(latest.status = 'inconclusive') THEN 'inconclusive'
          ELSE 'unknown'
        END AS best_status,
        avg(latest.success_rate) AS average_success_rate,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY latest.median_latency_ms)
          FILTER (WHERE latest.median_latency_ms IS NOT NULL) AS median_latency_ms,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY latest.p95_latency_ms)
          FILTER (WHERE latest.p95_latency_ms IS NOT NULL) AS p95_latency_ms
      FROM endpoint_sources es
      LEFT JOIN latest ON latest.endpoint_id = es.endpoint_id
      GROUP BY es.provider_id, es.name
      ORDER BY endpoint_count DESC, name
      LIMIT $1
      `,
      [limit]
    );

    return result.rows.map((row) => ({
      providerId: row.provider_id,
      name: row.name,
      endpointCount: Number(row.endpoint_count),
      bestStatus: row.best_status ?? "unknown",
      averageSuccessRate: row.average_success_rate ?? undefined,
      medianLatencyMs: row.median_latency_ms ?? undefined,
      p95LatencyMs: row.p95_latency_ms ?? undefined,
    }));
  }

  async endpointPerformance(limit: number): Promise<EndpointPerformanceItem[]> {
    if (!this.pool) {
      return [];
    }

    const result = await this.pool.query<{
      endpoint_id: string;
      provider_name: string | null;
      network_name: string | null;
      latest_status: string | null;
      check_count: string;
      monitor_count: number | null;
      success_rate: number | null;
      error_rate: number | null;
      median_latency_ms: number | null;
      p95_latency_ms: number | null;
      latest_block_number: number | null;
      window_start: string | null;
      window_end: string | null;
    }>(
      `
      WITH latest AS (
        SELECT DISTINCT ON (endpoint_id, check_type)
          endpoint_id,
          check_type,
          window_start,
          window_end,
          monitor_count,
          success_rate,
          error_rate,
          median_latency_ms,
          p95_latency_ms,
          median_block_number,
          status
        FROM aggregate_windows
        ORDER BY endpoint_id, check_type, window_start DESC
      )
      SELECT
        latest.endpoint_id,
        p.name AS provider_name,
        e.network_name,
        CASE
          WHEN bool_or(latest.status = 'down') THEN 'down'
          WHEN bool_or(latest.status = 'degraded') THEN 'degraded'
          WHEN bool_or(latest.status = 'healthy') THEN 'healthy'
          WHEN bool_or(latest.status = 'inconclusive') THEN 'inconclusive'
          ELSE 'unknown'
        END AS latest_status,
        count(*)::text AS check_count,
        max(latest.monitor_count) AS monitor_count,
        avg(latest.success_rate) AS success_rate,
        avg(latest.error_rate) AS error_rate,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY latest.median_latency_ms)
          FILTER (WHERE latest.median_latency_ms IS NOT NULL) AS median_latency_ms,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY latest.p95_latency_ms)
          FILTER (WHERE latest.p95_latency_ms IS NOT NULL) AS p95_latency_ms,
        max(latest.median_block_number) AS latest_block_number,
        max(latest.window_start)::text AS window_start,
        max(latest.window_end)::text AS window_end
      FROM latest
      LEFT JOIN rpc_endpoints e ON e.id = latest.endpoint_id
      LEFT JOIN providers p ON p.id = e.provider_id
      GROUP BY latest.endpoint_id, p.name, e.network_name
      ORDER BY max(latest.window_start) DESC, latest.endpoint_id
      LIMIT $1
      `,
      [limit]
    );

    return result.rows.map((row) => ({
      endpointId: row.endpoint_id,
      providerName: row.provider_name ?? undefined,
      networkName: row.network_name ?? undefined,
      latestStatus: row.latest_status ?? "unknown",
      checkCount: Number(row.check_count),
      monitorCount: row.monitor_count ?? 0,
      successRate: row.success_rate ?? undefined,
      errorRate: row.error_rate ?? undefined,
      medianLatencyMs: row.median_latency_ms ?? undefined,
      p95LatencyMs: row.p95_latency_ms ?? undefined,
      latestBlockNumber: row.latest_block_number ?? undefined,
      windowStart: row.window_start === null ? undefined : Number(row.window_start),
      windowEnd: row.window_end === null ? undefined : Number(row.window_end),
    }));
  }

  async monitorHealth(limit: number): Promise<MonitorHealthItem[]> {
    if (!this.pool) {
      return [];
    }

    const result = await this.pool.query<{
      id: string;
      region: string;
      country: string;
      cloud_provider: string;
      asn: string;
      status: string;
      software_version: string | null;
      last_seen_at: string | null;
      report_count: string;
      accepted_report_count: string;
    }>(
      `
      SELECT
        m.id,
        m.region,
        m.country,
        m.cloud_provider,
        m.asn,
        CASE
          WHEN m.last_seen_at IS NULL THEN 'unknown'
          WHEN m.last_seen_at < now() - interval '2 minutes' THEN 'stale'
          ELSE m.status
        END AS status,
        m.software_version,
        m.last_seen_at::text,
        count(r.id)::text AS report_count,
        count(r.id) FILTER (WHERE r.accepted)::text AS accepted_report_count
      FROM monitors m
      LEFT JOIN monitoring_reports r ON r.monitor_id = m.id
      GROUP BY m.id
      ORDER BY m.last_seen_at DESC NULLS LAST, m.id
      LIMIT $1
      `,
      [limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      region: row.region,
      country: row.country,
      cloudProvider: row.cloud_provider,
      asn: row.asn,
      status: row.status,
      softwareVersion: row.software_version ?? undefined,
      lastSeenAt: row.last_seen_at ?? undefined,
      reportCount: Number(row.report_count),
      acceptedReportCount: Number(row.accepted_report_count),
    }));
  }

  async recentReports(limit: number): Promise<RecentReportItem[]> {
    if (!this.pool) {
      return [];
    }

    const result = await this.pool.query<{
      report_uuid: string;
      monitor_id: string;
      endpoint_id: string;
      check_type: string;
      latency_ms: string;
      success: boolean;
      accepted: boolean;
      rejection_reason: string | null;
      received_at: string;
    }>(
      `
      SELECT
        report_uuid,
        monitor_id,
        endpoint_id,
        check_type,
        latency_ms::text,
        success,
        accepted,
        rejection_reason,
        received_at::text
      FROM monitoring_reports
      ORDER BY received_at DESC
      LIMIT $1
      `,
      [limit]
    );

    return result.rows.map((row) => ({
      reportId: row.report_uuid,
      monitorId: row.monitor_id,
      endpointId: row.endpoint_id,
      checkType: row.check_type,
      latencyMs: Number(row.latency_ms),
      success: row.success,
      accepted: row.accepted,
      rejectionReason: row.rejection_reason ?? undefined,
      receivedAt: row.received_at,
    }));
  }

  async uncommittedAcceptedReports(limit: number): Promise<CommittableReportRow[]> {
    if (!this.pool) {
      return [];
    }

    const result = await this.pool.query<{
      report_uuid: string;
      endpoint_id: string;
      recovered_address: string | null;
      payload_hash: string;
      measurement_window: string;
    }>(
      `
      SELECT report_uuid, endpoint_id, recovered_address, payload_hash, measurement_window::text
      FROM monitoring_reports
      WHERE accepted
        AND committed_at IS NULL
      ORDER BY measurement_window, report_uuid
      LIMIT $1
      `,
      [limit]
    );

    return result.rows.map((row) => ({
      reportId: row.report_uuid,
      endpointId: row.endpoint_id,
      monitorAddress: normalizeAddress(row.recovered_address),
      payloadHash: row.payload_hash as `0x${string}`,
      measurementWindow: Number(row.measurement_window),
    }));
  }

  async createReportBatch(input: ReportBatchInsert): Promise<void> {
    if (!this.pool || input.reports.length === 0) {
      return;
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `
        INSERT INTO report_batches (
          batch_id, merkle_root, start_window, end_window, report_count, status
        )
        VALUES ($1, $2, $3, $4, $5, 'built')
        ON CONFLICT (batch_id) DO NOTHING
        `,
        [input.batchId, input.merkleRoot, input.startWindow, input.endWindow, input.reportCount]
      );

      for (const report of input.reports) {
        await client.query(
          `
          INSERT INTO report_batch_reports (batch_id, report_uuid, leaf_index, leaf_hash)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (batch_id, report_uuid) DO NOTHING
          `,
          [input.batchId, report.reportId, report.leafIndex, report.leafHash]
        );
      }

      await client.query(
        `
        UPDATE monitoring_reports
        SET committed_at = now()
        WHERE report_uuid = ANY($1::text[])
        `,
        [input.reports.map((report) => report.reportId)]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async markReportBatchPublished(batchId: string, txHash: string): Promise<void> {
    if (!this.pool) {
      return;
    }

    await this.pool.query(
      `
      UPDATE report_batches
      SET status = 'published',
        tx_hash = $2,
        published_at = now()
      WHERE batch_id = $1
      `,
      [batchId, txHash]
    );
  }

  async recentReportBatches(limit: number): Promise<ReportBatchItem[]> {
    if (!this.pool) {
      return [];
    }

    const result = await this.pool.query<{
      batch_id: string;
      merkle_root: string;
      start_window: string;
      end_window: string;
      report_count: number;
      status: string;
      tx_hash: string | null;
      created_at: string;
      published_at: string | null;
    }>(
      `
      SELECT
        batch_id,
        merkle_root,
        start_window::text,
        end_window::text,
        report_count,
        status,
        tx_hash,
        created_at::text,
        published_at::text
      FROM report_batches
      ORDER BY created_at DESC
      LIMIT $1
      `,
      [limit]
    );

    return result.rows.map(mapReportBatch);
  }

  async reportBatch(batchId: string): Promise<ReportBatchItem | undefined> {
    if (!this.pool) {
      return undefined;
    }

    const result = await this.pool.query<{
      batch_id: string;
      merkle_root: string;
      start_window: string;
      end_window: string;
      report_count: number;
      status: string;
      tx_hash: string | null;
      created_at: string;
      published_at: string | null;
    }>(
      `
      SELECT
        batch_id,
        merkle_root,
        start_window::text,
        end_window::text,
        report_count,
        status,
        tx_hash,
        created_at::text,
        published_at::text
      FROM report_batches
      WHERE batch_id = $1
      `,
      [batchId]
    );

    const row = result.rows[0];
    return row ? mapReportBatch(row) : undefined;
  }

  async reportProofData(reportId: string): Promise<ReportProofData | undefined> {
    if (!this.pool) {
      return undefined;
    }

    const reportResult = await this.pool.query<{
      batch_id: string;
      report_uuid: string;
      leaf_index: number;
      leaf_hash: string;
      merkle_root: string;
      start_window: string;
      end_window: string;
      report_count: number;
      status: string;
      tx_hash: string | null;
      created_at: string;
      published_at: string | null;
    }>(
      `
      SELECT
        b.batch_id,
        br.report_uuid,
        br.leaf_index,
        br.leaf_hash,
        b.merkle_root,
        b.start_window::text,
        b.end_window::text,
        b.report_count,
        b.status,
        b.tx_hash,
        b.created_at::text,
        b.published_at::text
      FROM report_batch_reports br
      JOIN report_batches b ON b.batch_id = br.batch_id
      WHERE br.report_uuid = $1
      ORDER BY b.created_at DESC
      LIMIT 1
      `,
      [reportId]
    );

    const reportRow = reportResult.rows[0];
    if (!reportRow) {
      return undefined;
    }

    const leavesResult = await this.pool.query<{ leaf_hash: string }>(
      `
      SELECT leaf_hash
      FROM report_batch_reports
      WHERE batch_id = $1
      ORDER BY leaf_index
      `,
      [reportRow.batch_id]
    );

    return {
      batch: mapReportBatch(reportRow),
      leaves: leavesResult.rows.map((row) => row.leaf_hash as `0x${string}`),
      report: {
        reportId: reportRow.report_uuid,
        leafHash: reportRow.leaf_hash as `0x${string}`,
        leafIndex: reportRow.leaf_index,
      },
    };
  }

  async createSla(input: SlaCreate): Promise<SlaItem> {
    if (!this.pool) {
      return { ...input, status: "active", createdAt: new Date().toISOString() };
    }

    await this.pool.query(
      `
      INSERT INTO slas (
        id, provider_id, customer_id, provider_address, customer_address, endpoint_id,
        period_start, period_end, minimum_uptime, maximum_p95_latency_ms,
        maximum_error_rate, maximum_block_delay, terms_hash
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `,
      [
        input.id,
        input.providerId,
        input.customerId,
        input.providerAddress,
        input.customerAddress,
        input.endpointId,
        input.periodStart,
        input.periodEnd,
        input.minimumUptime,
        input.maximumP95LatencyMs,
        input.maximumErrorRate,
        input.maximumBlockDelay,
        input.termsHash,
      ]
    );

    return (await this.sla(input.id))!;
  }

  async recentSlas(limit: number): Promise<SlaItem[]> {
    if (!this.pool) return [];
    const result = await this.pool.query<SlaDbRow>(
      `${slaSelectSql} ORDER BY s.created_at DESC LIMIT $1`,
      [limit]
    );
    return result.rows.map(mapSla);
  }

  async sla(slaId: string): Promise<SlaItem | undefined> {
    if (!this.pool) return undefined;
    const result = await this.pool.query<SlaDbRow>(`${slaSelectSql} WHERE s.id = $1`, [slaId]);
    const row = result.rows[0];
    return row ? mapSla(row) : undefined;
  }

  async pendingSlas(limit: number): Promise<SlaItem[]> {
    if (!this.pool) return [];
    const result = await this.pool.query<SlaDbRow>(
      `${slaSelectSql}
       WHERE s.status = 'active'
         AND s.period_end <= extract(epoch FROM now())::bigint
         AND e.evaluation_id IS NULL
       ORDER BY s.period_end, s.id
       LIMIT $1`,
      [limit]
    );
    return result.rows.map(mapSla);
  }

  async unpublishedSlaEvaluations(limit: number): Promise<SlaItem[]> {
    if (!this.pool) return [];
    const result = await this.pool.query<SlaDbRow>(
      `${slaSelectSql}
       WHERE e.evaluation_id IS NOT NULL AND e.tx_hash IS NULL
       ORDER BY e.evaluated_at
       LIMIT $1`,
      [limit]
    );
    return result.rows.map(mapSla);
  }

  async slaAggregateEvidence(sla: SlaItem): Promise<SlaAggregateEvidenceRow[]> {
    if (!this.pool) return [];
    const result = await this.pool.query<{
      endpoint_id: string;
      check_type: string;
      window_start: string;
      window_end: string;
      valid_report_count: number;
      success_rate: number;
      error_rate: number;
      p95_latency_ms: number | null;
      median_block_delay: number | null;
      status: string;
    }>(
      `
      SELECT endpoint_id, check_type, window_start::text, window_end::text,
        valid_report_count, success_rate, error_rate, p95_latency_ms,
        median_block_delay, status
      FROM aggregate_windows
      WHERE endpoint_id = $1 AND window_start >= $2 AND window_end <= $3
      ORDER BY window_start, check_type, window_end
      `,
      [sla.endpointId, sla.periodStart, sla.periodEnd]
    );
    return result.rows.map((row) => ({
      endpointId: row.endpoint_id,
      checkType: row.check_type,
      windowStart: Number(row.window_start),
      windowEnd: Number(row.window_end),
      validReportCount: row.valid_report_count,
      successRate: row.success_rate,
      errorRate: row.error_rate,
      p95LatencyMs: row.p95_latency_ms ?? undefined,
      medianBlockDelay: row.median_block_delay ?? undefined,
      status: row.status,
    }));
  }

  async saveSlaEvaluation(input: SlaEvaluationInsert): Promise<void> {
    if (!this.pool) return;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query<{ evaluation_id: string }>(
        `
        INSERT INTO sla_evaluations (
          evaluation_id, sla_id, outcome, evidence_root, aggregate_count,
          metrics_json, violation_reasons_json
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
        ON CONFLICT (sla_id) DO NOTHING
        RETURNING evaluation_id
        `,
        [
          input.evaluationId,
          input.slaId,
          input.outcome,
          input.evidenceRoot,
          input.aggregateCount,
          JSON.stringify(input.metrics),
          JSON.stringify(input.reasons),
        ]
      );
      if (!inserted.rows[0]) {
        await client.query("COMMIT");
        return;
      }
      for (const item of input.evidence) {
        const { leafIndex, leafHash, ...evidence } = item;
        await client.query(
          `
          INSERT INTO sla_evaluation_evidence (evaluation_id, leaf_index, leaf_hash, evidence_json)
          VALUES ($1, $2, $3, $4::jsonb)
          ON CONFLICT (evaluation_id, leaf_index) DO NOTHING
          `,
          [input.evaluationId, leafIndex, leafHash, JSON.stringify(evidence)]
        );
      }
      await client.query("UPDATE slas SET status = 'evaluated', updated_at = now() WHERE id = $1", [
        input.slaId,
      ]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async markSlaRegistered(slaId: string, txHash: string): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(
      "UPDATE slas SET registration_tx_hash = $2, updated_at = now() WHERE id = $1",
      [slaId, txHash]
    );
  }

  async markSlaEvaluationPublished(evaluationId: string, txHash: string): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(
      `UPDATE sla_evaluations SET tx_hash = $2, published_at = now() WHERE evaluation_id = $1`,
      [evaluationId, txHash]
    );
  }

  async slaEvaluationProofData(evaluationId: string): Promise<SlaEvaluationProofData | undefined> {
    if (!this.pool) return undefined;
    const evaluationResult = await this.pool.query<SlaEvaluationDbRow>(
      `${slaEvaluationSelectSql} WHERE evaluation_id = $1`,
      [evaluationId]
    );
    const evaluationRow = evaluationResult.rows[0];
    if (!evaluationRow) return undefined;

    const evidenceResult = await this.pool.query<{
      leaf_index: number;
      leaf_hash: string;
      evidence_json: SlaAggregateEvidenceRow;
    }>(
      `SELECT leaf_index, leaf_hash, evidence_json FROM sla_evaluation_evidence
       WHERE evaluation_id = $1 ORDER BY leaf_index`,
      [evaluationId]
    );
    return {
      evaluation: mapSlaEvaluation(evaluationRow),
      evidence: evidenceResult.rows.map((row) => ({
        ...row.evidence_json,
        leafIndex: row.leaf_index,
        leafHash: row.leaf_hash as `0x${string}`,
      })),
    };
  }

  async summary(): Promise<{
    monitors: number;
    endpoints: number;
    reports: number;
    acceptedReports: number;
    aggregateWindows: number;
    reportBatches: number;
    slas: number;
    slaEvaluations: number;
  }> {
    if (!this.pool) {
      return {
        monitors: 0,
        endpoints: 0,
        reports: 0,
        acceptedReports: 0,
        aggregateWindows: 0,
        reportBatches: 0,
        slas: 0,
        slaEvaluations: 0,
      };
    }

    const result = await this.pool.query<{
      monitors: string;
      endpoints: string;
      reports: string;
      accepted_reports: string;
      aggregate_windows: string;
      report_batches: string;
      slas: string;
      sla_evaluations: string;
    }>(`
      SELECT
        (SELECT count(*) FROM monitors)::text AS monitors,
        (SELECT count(*) FROM rpc_endpoints)::text AS endpoints,
        (SELECT count(*) FROM monitoring_reports)::text AS reports,
        (SELECT count(*) FROM monitoring_reports WHERE accepted)::text AS accepted_reports,
        (SELECT count(*) FROM aggregate_windows)::text AS aggregate_windows,
        (SELECT count(*) FROM report_batches)::text AS report_batches,
        (SELECT count(*) FROM slas)::text AS slas,
        (SELECT count(*) FROM sla_evaluations)::text AS sla_evaluations
    `);

    const row = result.rows[0];
    return {
      monitors: Number(row?.monitors ?? 0),
      endpoints: Number(row?.endpoints ?? 0),
      reports: Number(row?.reports ?? 0),
      acceptedReports: Number(row?.accepted_reports ?? 0),
      aggregateWindows: Number(row?.aggregate_windows ?? 0),
      reportBatches: Number(row?.report_batches ?? 0),
      slas: Number(row?.slas ?? 0),
      slaEvaluations: Number(row?.sla_evaluations ?? 0),
    };
  }
}

interface SlaEvaluationDbRow {
  evaluation_id: string;
  evaluation_sla_id: string;
  outcome: string;
  evidence_root: string;
  aggregate_count: number;
  metrics_json: Record<string, unknown>;
  violation_reasons_json: string[];
  evaluation_tx_hash: string | null;
  evaluated_at: string;
  published_at: string | null;
}

interface SlaDbRow extends SlaEvaluationDbRow {
  sla_id: string;
  provider_id: string;
  customer_id: string;
  provider_address: string | null;
  customer_address: string | null;
  endpoint_id: string;
  period_start: string;
  period_end: string;
  minimum_uptime: number;
  maximum_p95_latency_ms: number | null;
  maximum_error_rate: number | null;
  maximum_block_delay: number | null;
  terms_hash: string;
  sla_status: string;
  registration_tx_hash: string | null;
  sla_created_at: string;
}

const slaEvaluationSelectSql = `
  SELECT evaluation_id, sla_id AS evaluation_sla_id, outcome, evidence_root,
    aggregate_count, metrics_json, violation_reasons_json,
    tx_hash AS evaluation_tx_hash, evaluated_at::text, published_at::text
  FROM sla_evaluations
`;

const slaSelectSql = `
  SELECT s.id AS sla_id, s.provider_id, s.customer_id, s.provider_address,
    s.customer_address, s.endpoint_id, s.period_start::text, s.period_end::text,
    s.minimum_uptime, s.maximum_p95_latency_ms, s.maximum_error_rate,
    s.maximum_block_delay, s.terms_hash, s.status AS sla_status,
    s.registration_tx_hash, s.created_at::text AS sla_created_at,
    e.evaluation_id, e.sla_id AS evaluation_sla_id, e.outcome, e.evidence_root,
    e.aggregate_count, e.metrics_json, e.violation_reasons_json,
    e.tx_hash AS evaluation_tx_hash, e.evaluated_at::text, e.published_at::text
  FROM slas s
  LEFT JOIN sla_evaluations e ON e.sla_id = s.id
`;

function mapSla(row: SlaDbRow): SlaItem {
  return {
    id: row.sla_id,
    providerId: row.provider_id,
    customerId: row.customer_id,
    providerAddress: row.provider_address ?? undefined,
    customerAddress: row.customer_address ?? undefined,
    endpointId: row.endpoint_id,
    periodStart: Number(row.period_start),
    periodEnd: Number(row.period_end),
    minimumUptime: row.minimum_uptime,
    maximumP95LatencyMs: row.maximum_p95_latency_ms ?? undefined,
    maximumErrorRate: row.maximum_error_rate ?? undefined,
    maximumBlockDelay: row.maximum_block_delay ?? undefined,
    termsHash: row.terms_hash as `0x${string}`,
    status: row.sla_status,
    registrationTxHash: row.registration_tx_hash ?? undefined,
    createdAt: row.sla_created_at,
    evaluation: row.evaluation_id ? mapSlaEvaluation(row) : undefined,
  };
}

function mapSlaEvaluation(row: SlaEvaluationDbRow): SlaEvaluationItem {
  return {
    evaluationId: row.evaluation_id,
    slaId: row.evaluation_sla_id,
    outcome: row.outcome,
    evidenceRoot: row.evidence_root as `0x${string}`,
    aggregateCount: row.aggregate_count,
    metrics: row.metrics_json,
    reasons: row.violation_reasons_json,
    txHash: row.evaluation_tx_hash ?? undefined,
    evaluatedAt: row.evaluated_at,
    publishedAt: row.published_at ?? undefined,
  };
}

function normalizeAddress(value: string | null): `0x${string}` | undefined {
  if (!value || !/^0x[a-fA-F0-9]{40}$/u.test(value)) {
    return undefined;
  }
  return value.toLowerCase() as `0x${string}`;
}

function mapReportBatch(row: {
  batch_id: string;
  merkle_root: string;
  start_window: string;
  end_window: string;
  report_count: number;
  status: string;
  tx_hash: string | null;
  created_at: string;
  published_at: string | null;
}): ReportBatchItem {
  return {
    batchId: row.batch_id,
    merkleRoot: row.merkle_root as `0x${string}`,
    startWindow: Number(row.start_window),
    endWindow: Number(row.end_window),
    reportCount: row.report_count,
    status: row.status,
    txHash: row.tx_hash ?? undefined,
    createdAt: row.created_at,
    publishedAt: row.published_at ?? undefined,
  };
}
