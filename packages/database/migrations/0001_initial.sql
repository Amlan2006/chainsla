CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  website TEXT,
  wallet_address TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rpc_endpoints (
  id TEXT PRIMARY KEY,
  provider_id TEXT REFERENCES providers(id),
  chain_id BIGINT NOT NULL,
  network_name TEXT NOT NULL,
  http_url_encrypted TEXT,
  websocket_url_encrypted TEXT,
  region_scope TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS monitors (
  id TEXT PRIMARY KEY,
  wallet_address TEXT,
  public_key TEXT,
  region TEXT NOT NULL,
  country TEXT NOT NULL,
  cloud_provider TEXT NOT NULL,
  asn TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  software_version TEXT,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS measurement_jobs (
  id TEXT PRIMARY KEY,
  endpoint_id TEXT NOT NULL REFERENCES rpc_endpoints(id),
  monitor_id TEXT NOT NULL REFERENCES monitors(id),
  check_type TEXT NOT NULL,
  chain_id BIGINT NOT NULL,
  interval_seconds INTEGER NOT NULL,
  timeout_ms INTEGER NOT NULL,
  assignment_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  assignment_end TIMESTAMPTZ,
  configuration_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (endpoint_id, monitor_id, check_type)
);

CREATE TABLE IF NOT EXISTS monitoring_reports (
  id BIGSERIAL PRIMARY KEY,
  report_uuid TEXT NOT NULL UNIQUE,
  monitor_id TEXT NOT NULL,
  endpoint_id TEXT NOT NULL,
  check_type TEXT NOT NULL,
  measurement_window BIGINT NOT NULL,
  request_started_at TIMESTAMPTZ NOT NULL,
  request_finished_at TIMESTAMPTZ NOT NULL,
  latency_ms BIGINT NOT NULL,
  success BOOLEAN NOT NULL,
  error_code TEXT,
  error_category TEXT,
  rpc_method TEXT,
  rpc_result_hash TEXT,
  block_number BIGINT,
  nonce BIGINT NOT NULL,
  signature TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  recovered_address TEXT,
  payload_json JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted BOOLEAN NOT NULL,
  rejection_reason TEXT,
  committed_at TIMESTAMPTZ,
  UNIQUE (monitor_id, nonce)
);

CREATE INDEX IF NOT EXISTS monitoring_reports_endpoint_window_idx
  ON monitoring_reports (endpoint_id, check_type, measurement_window);

CREATE INDEX IF NOT EXISTS monitoring_reports_monitor_received_idx
  ON monitoring_reports (monitor_id, received_at DESC);

CREATE TABLE IF NOT EXISTS aggregate_windows (
  id BIGSERIAL PRIMARY KEY,
  endpoint_id TEXT NOT NULL,
  check_type TEXT NOT NULL,
  window_start BIGINT NOT NULL,
  window_end BIGINT NOT NULL,
  monitor_count INTEGER NOT NULL,
  valid_report_count INTEGER NOT NULL,
  success_rate DOUBLE PRECISION NOT NULL,
  error_rate DOUBLE PRECISION NOT NULL,
  median_latency_ms DOUBLE PRECISION,
  p50_latency_ms DOUBLE PRECISION,
  p95_latency_ms DOUBLE PRECISION,
  p99_latency_ms DOUBLE PRECISION,
  median_block_number DOUBLE PRECISION,
  median_block_delay DOUBLE PRECISION,
  status TEXT NOT NULL,
  excluded_report_count INTEGER NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (endpoint_id, check_type, window_start)
);

CREATE INDEX IF NOT EXISTS aggregate_windows_endpoint_window_idx
  ON aggregate_windows (endpoint_id, check_type, window_start DESC);
