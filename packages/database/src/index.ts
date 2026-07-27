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

  async summary(): Promise<{
    monitors: number;
    endpoints: number;
    reports: number;
    acceptedReports: number;
    aggregateWindows: number;
  }> {
    if (!this.pool) {
      return {
        monitors: 0,
        endpoints: 0,
        reports: 0,
        acceptedReports: 0,
        aggregateWindows: 0,
      };
    }

    const result = await this.pool.query<{
      monitors: string;
      endpoints: string;
      reports: string;
      accepted_reports: string;
      aggregate_windows: string;
    }>(`
      SELECT
        (SELECT count(*) FROM monitors)::text AS monitors,
        (SELECT count(*) FROM rpc_endpoints)::text AS endpoints,
        (SELECT count(*) FROM monitoring_reports)::text AS reports,
        (SELECT count(*) FROM monitoring_reports WHERE accepted)::text AS accepted_reports,
        (SELECT count(*) FROM aggregate_windows)::text AS aggregate_windows
    `);

    const row = result.rows[0];
    return {
      monitors: Number(row?.monitors ?? 0),
      endpoints: Number(row?.endpoints ?? 0),
      reports: Number(row?.reports ?? 0),
      acceptedReports: Number(row?.accepted_reports ?? 0),
      aggregateWindows: Number(row?.aggregate_windows ?? 0),
    };
  }
}
