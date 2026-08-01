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

CREATE TABLE IF NOT EXISTS report_batches (
  batch_id TEXT PRIMARY KEY,
  merkle_root TEXT NOT NULL,
  start_window BIGINT NOT NULL,
  end_window BIGINT NOT NULL,
  report_count INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'built',
  tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS report_batch_reports (
  batch_id TEXT NOT NULL REFERENCES report_batches(batch_id) ON DELETE CASCADE,
  report_uuid TEXT NOT NULL REFERENCES monitoring_reports(report_uuid) ON DELETE CASCADE,
  leaf_index INTEGER NOT NULL,
  leaf_hash TEXT NOT NULL,
  PRIMARY KEY (batch_id, report_uuid),
  UNIQUE (batch_id, leaf_index)
);

CREATE INDEX IF NOT EXISTS report_batch_reports_report_idx
  ON report_batch_reports (report_uuid);

CREATE TABLE IF NOT EXISTS slas (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  provider_address TEXT,
  customer_address TEXT,
  endpoint_id TEXT NOT NULL REFERENCES rpc_endpoints(id),
  period_start BIGINT NOT NULL,
  period_end BIGINT NOT NULL,
  minimum_uptime DOUBLE PRECISION NOT NULL,
  maximum_p95_latency_ms DOUBLE PRECISION,
  maximum_error_rate DOUBLE PRECISION,
  maximum_block_delay DOUBLE PRECISION,
  terms_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  registration_tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end > period_start),
  CHECK (minimum_uptime >= 0 AND minimum_uptime <= 1),
  CHECK (maximum_error_rate IS NULL OR (maximum_error_rate >= 0 AND maximum_error_rate <= 1))
);

CREATE INDEX IF NOT EXISTS slas_evaluation_due_idx
  ON slas (status, period_end);

CREATE TABLE IF NOT EXISTS sla_evaluations (
  evaluation_id TEXT PRIMARY KEY,
  sla_id TEXT NOT NULL UNIQUE REFERENCES slas(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL,
  evidence_root TEXT NOT NULL,
  aggregate_count INTEGER NOT NULL,
  metrics_json JSONB NOT NULL,
  violation_reasons_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  tx_hash TEXT,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sla_evaluation_evidence (
  evaluation_id TEXT NOT NULL REFERENCES sla_evaluations(evaluation_id) ON DELETE CASCADE,
  leaf_index INTEGER NOT NULL,
  leaf_hash TEXT NOT NULL,
  evidence_json JSONB NOT NULL,
  PRIMARY KEY (evaluation_id, leaf_index)
);
