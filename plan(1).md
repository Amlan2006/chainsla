# Decentralized RPC Monitoring and SLA Verification Platform

## 1. Project Summary

Build a decentralized platform that independently monitors blockchain RPC providers and verifies whether they meet advertised service-level agreements.

Distributed monitor nodes will test RPC endpoints from different servers, regions, cloud providers, and network paths. Each node will collect measurements, sign its reports, and submit them to an aggregation service.

The aggregation layer will validate reports, reject outliers, calculate consensus metrics, store detailed evidence off-chain, and periodically commit cryptographic proofs to an EVM-compatible blockchain.

RPC providers may optionally register service plans, deposit collateral, and define measurable SLA conditions. Customers can subscribe to those plans. If the provider meets the SLA, payment is released normally. If the provider violates the SLA, the smart contract can issue service credits or compensation.

The MVP should prioritize reliable monitoring, signed evidence, and transparent reporting. Automated financial penalties should be added only after the monitoring system is stable.

---

## 2. Primary Use Case

The initial use case is monitoring blockchain JSON-RPC providers.

The platform should verify:

- HTTP endpoint availability
- JSON-RPC response latency
- Request failure rate
- Correctness of JSON-RPC responses
- Latest block number
- Block freshness
- Synchronization delay compared with reference providers
- WebSocket availability
- WebSocket disconnect rate
- New-head event delay
- Chain ID correctness
- Rate-limit behavior
- Historical query support
- `eth_call` reliability
- `eth_getLogs` reliability

Target users:

- RPC providers
- DeFi applications
- Wallets
- Exchanges
- Bridges
- Trading bots
- Blockchain indexers
- Infrastructure teams
- Enterprise customers requiring verifiable SLAs

---

## 3. MVP Goals

The MVP must support:

1. Registering RPC providers and endpoints.
2. Deploying multiple independent monitor instances from one shared codebase, with configurable many-to-many assignments between monitors and RPC endpoints.
3. Running scheduled JSON-RPC health checks.
4. Measuring latency, uptime, errors, and block freshness.
5. Signing every monitoring report.
6. Submitting reports to a central aggregation API.
7. Verifying signatures server-side.
8. Aggregating reports from multiple monitors.
9. Rejecting invalid, stale, duplicate, and abnormal reports.
10. Storing detailed monitoring data in PostgreSQL.
11. Creating periodic Merkle roots of accepted reports.
12. Publishing Merkle roots to an EVM smart contract.
13. Displaying provider performance on a dashboard.
14. Creating basic SLA definitions.
15. Detecting SLA violations.
16. Generating downloadable or API-accessible SLA reports.

The MVP should not initially include:

- A custom blockchain
- A custom token
- DAO governance
- Fully permissionless monitor registration
- Complex slashing
- Zero-knowledge proofs
- Decentralized storage for all raw measurements
- Automated customer compensation
- Machine-learning anomaly detection
- Kubernetes deployment

---

## 4. Recommended Technology Stack

### Monitor Node

- Language: Go
- HTTP client: standard `net/http`
- WebSocket client: `gorilla/websocket`
- Cryptography: secp256k1 Ethereum-compatible signing
- Metrics: Prometheus client
- Configuration: YAML or environment variables
- Logging: structured JSON logs
- Packaging: Docker

### Aggregator Backend

Preferred option:

- Language: TypeScript
- Runtime: Node.js
- Framework: Fastify
- Blockchain client: Viem
- Database: PostgreSQL
- ORM/query builder: Drizzle ORM
- Queue: Redis and BullMQ
- Validation: Zod
- Authentication: API keys initially
- Metrics: Prometheus
- API documentation: OpenAPI

Alternative:

- Go backend using Fiber, Chi, or Gin

Use TypeScript for the MVP unless performance testing proves it insufficient.

### Smart Contracts

- Language: Solidity
- Framework: Foundry
- Libraries: OpenZeppelin Contracts
- Target chain: Base Sepolia for testing
- Production candidate: Base, Arbitrum, or Polygon
- Signature format: EIP-712 where on-chain verification is needed
- Upgradeability: avoid for the first MVP unless required

### Frontend

- Next.js
- TypeScript
- Tailwind CSS
- Viem
- Wagmi
- Recharts or lightweight charting library
- Server-side fetching for public provider pages

### Infrastructure

- Docker Compose for local development
- VPS deployment for monitor nodes
- Managed PostgreSQL for staging
- Redis for queue processing
- Nginx or Caddy as reverse proxy
- GitHub Actions for CI
- Prometheus and Grafana for observability

---

## 5. High-Level Architecture

```text
                         +----------------------+
                         |   Provider Dashboard |
                         |      Next.js UI      |
                         +----------+-----------+
                                    |
                                    v
+----------------+         +--------+---------+         +------------------+
| Monitor Node A | ------> | Aggregator API   | ------> | PostgreSQL       |
| Mumbai         |         | Fastify          |         | Raw reports      |
+----------------+         +--------+---------+         | Aggregates       |
                                    |                   | SLA results      |
+----------------+                  |                   +------------------+
| Monitor Node B | -----------------+
| Singapore      |                  |
+----------------+                  v
                           +--------+---------+
+----------------+         | Queue Workers    |
| Monitor Node C | ------> | Validation       |
| Frankfurt      |         | Aggregation      |
+----------------+         | Merkle batching  |
                           +--------+---------+
                                    |
                                    v
                           +--------+---------+
                           | EVM Contracts     |
                           | Registry          |
                           | Root commitments  |
                           | SLA records       |
                           +------------------+
```

---

## 6. Repository Structure

Create a monorepo.

```text
rpc-sla-platform/
├── apps/
│   ├── api/
│   ├── dashboard/
│   └── worker/
├── services/
│   └── monitor-node/
├── packages/
│   ├── shared-types/
│   ├── validation/
│   ├── crypto/
│   ├── merkle/
│   ├── database/
│   └── contract-bindings/
├── contracts/
│   ├── src/
│   ├── test/
│   ├── script/
│   └── foundry.toml
├── infrastructure/
│   ├── docker/
│   ├── nginx/
│   ├── prometheus/
│   └── grafana/
├── docs/
│   ├── architecture.md
│   ├── threat-model.md
│   ├── api.md
│   ├── monitor-protocol.md
│   └── deployment.md
├── scripts/
├── .github/
│   └── workflows/
├── docker-compose.yml
├── pnpm-workspace.yaml
├── package.json
├── Makefile
├── README.md
└── plan.md
```

Use `pnpm` for the TypeScript workspace.

---

## 7. Core Domain Models

### Provider

```text
id
name
website
wallet_address
status
created_at
updated_at
```

### RPC Endpoint

```text
id
provider_id
chain_id
network_name
http_url_encrypted
websocket_url_encrypted
region_scope
is_public
status
created_at
updated_at
```

Do not expose private or authenticated RPC URLs publicly.

### Monitor

```text
id
name
wallet_address
public_key
region
country
cloud_provider
asn
ip_hash
status
software_version
last_seen_at
created_at
updated_at
```

### Measurement Job

```text
id
endpoint_id
check_type
interval_seconds
timeout_ms
enabled
configuration_json
created_at
updated_at
```

### Monitoring Report

```text
id
report_uuid
monitor_id
endpoint_id
check_type
measurement_window
request_started_at
request_finished_at
latency_ms
success
error_code
error_category
http_status
rpc_method
rpc_result_hash
block_number
block_timestamp
block_delay
metadata_json
nonce
signature
payload_hash
received_at
accepted
rejection_reason
```

### Aggregate Window

```text
id
endpoint_id
window_start
window_end
monitor_count
valid_report_count
success_rate
median_latency_ms
p95_latency_ms
packet_loss_rate
median_block_delay
websocket_disconnect_rate
status
merkle_root
created_at
```

### SLA

```text
id
provider_id
endpoint_id
customer_wallet
provider_wallet
start_time
end_time
minimum_uptime_bps
maximum_median_latency_ms
maximum_p95_latency_ms
maximum_error_rate_bps
maximum_block_delay
evaluation_window
status
onchain_sla_id
created_at
updated_at
```

### SLA Evaluation

```text
id
sla_id
period_start
period_end
uptime_bps
median_latency_ms
p95_latency_ms
error_rate_bps
block_delay
violated
violation_reasons
evidence_root
created_at
```

---

## 8. Monitor Node Requirements

Each monitor node must:

1. Load configuration from environment variables or YAML.
2. Register with the aggregator.
3. Authenticate using a monitor API token.
4. Maintain an Ethereum-compatible secp256k1 key pair.
5. Poll the aggregator for assigned jobs.
6. Execute checks at scheduled intervals.
7. Produce deterministic report payloads.
8. Sign report payload hashes.
9. Retry failed submissions with exponential backoff.
10. Persist unsent reports locally.
11. Expose Prometheus metrics.
12. Support graceful shutdown.
13. Include a software version in every report.
14. Detect local clock drift.
15. Reject jobs for unsupported chains or methods.
16. Avoid logging secrets or private endpoint tokens.

### Initial Check Types

#### HTTP Availability

- Send a valid JSON-RPC request.
- Record DNS, TCP, TLS, time-to-first-byte, and total latency if possible.
- Record HTTP status and timeout category.

#### `eth_chainId`

- Verify the endpoint serves the expected chain.
- Reject responses with incorrect chain ID.

#### `eth_blockNumber`

- Record the latest block number.
- Compare later in the aggregator against reference providers.

#### `eth_getBlockByNumber`

- Request the latest block.
- Record block number, hash, and timestamp.
- Calculate freshness from monitor time.

#### `eth_call`

- Execute a safe, deterministic read-only call.
- Hash the result.
- Compare results across providers.

#### `eth_getLogs`

- Request logs from a small finalized block range.
- Record latency and result hash.
- Avoid expensive ranges.

#### WebSocket New Heads

- Connect using WebSocket.
- Subscribe to `newHeads`.
- Record connection time, event delay, disconnects, and reconnects.

### Canonical Report Payload

```json
{
  "protocolVersion": "1.0",
  "reportId": "uuid",
  "monitorId": "monitor-uuid",
  "endpointId": "endpoint-uuid",
  "chainId": 8453,
  "checkType": "ETH_BLOCK_NUMBER",
  "measurementWindow": 1784896200,
  "startedAt": 1784896200123,
  "finishedAt": 1784896200218,
  "latencyMs": 95,
  "success": true,
  "rpcMethod": "eth_blockNumber",
  "resultHash": "0x...",
  "blockNumber": 31234567,
  "nonce": 498220,
  "softwareVersion": "0.1.0"
}
```

Rules:

- Field order must be deterministic before hashing.
- Timestamps must be UTC Unix timestamps.
- The nonce must be monotonically increasing per monitor.
- The report ID must be unique.
- The monitor must sign the hash of the canonical payload.
- Do not include secrets in the signed payload.

---

## 8.1 Monitor Deployment and Endpoint Assignment Model

The platform must use one shared monitor-node codebase.

Do not create a separate source-code folder, repository, or implementation for every monitor or RPC endpoint. All monitor instances must be built from the same Go codebase and the same versioned binary or Docker image.

Each deployed monitor instance must run independently with its own:

- Monitor ID
- Signing private key
- API credential
- Region metadata
- Country metadata
- Cloud-provider metadata
- ASN metadata
- Local persistent report queue
- Logs
- Runtime configuration
- Process or container
- Server or VPS in production

Example deployment:

```text
Shared monitor-node codebase
├── Instance 1 — Mumbai server
├── Instance 2 — Singapore server
├── Instance 3 — Frankfurt server
├── Instance 4 — US East server
└── Instance 5 — another independent network
```

Each instance should normally run on a separate server in production. Deployments should use different geographic regions, cloud providers, ISPs, or autonomous systems where possible.

### Endpoint Assignment Rules

Monitor instances must not permanently hard-code one RPC endpoint into the source code.

The aggregator must create measurement jobs and dynamically assign RPC endpoints to eligible monitor instances.

One monitor instance may monitor multiple RPC endpoints:

```text
Monitor Mumbai
├── Ethereum Provider A
├── Ethereum Provider B
├── Base Provider A
└── BNB Chain Provider A
```

One RPC endpoint must be monitored by multiple independent monitor instances:

```text
Ethereum Provider A
├── Monitor Mumbai
├── Monitor Singapore
├── Monitor Frankfurt
├── Monitor US East
└── Monitor Bangalore
```

The system must support a many-to-many relationship:

```text
Monitors <-> Measurement Jobs <-> RPC Endpoints
```

A measurement job should contain:

```text
job_id
endpoint_id
monitor_id
check_type
chain_id
interval_seconds
timeout_ms
assignment_start
assignment_end
configuration
status
```

### Default Redundancy Policy

For development:

```text
Minimum assigned monitors per endpoint: 3
Minimum valid reports per measurement window: 2
```

For staging and production:

```text
Recommended assigned monitors per endpoint: 5
Minimum valid reports per measurement window: 3
Minimum distinct geographic regions: 2
Recommended distinct geographic regions: 3
Maximum monitors from one cloud provider: 2
Maximum monitors from one ASN: 1 where practical
```

Critical or enterprise SLA endpoints may require more monitors.

Example:

```text
Standard endpoint: 5 assigned monitors
Critical endpoint: 7-9 assigned monitors
Minimum consensus for settlement-sensitive data: configurable quorum
```

### Why Multiple Monitors Must Test the Same Endpoint

A failed check from one monitor may be caused by:

- The monitor server being offline
- The monitor's ISP failing
- Regional routing problems
- DNS issues local to the monitor
- Cloud-provider outages
- Firewall rules
- Temporary packet loss
- Incorrect monitor configuration

Therefore, a single failed monitor report must not automatically count as an RPC-provider outage.

The aggregator must only classify an endpoint failure after evaluating reports from multiple independent monitors in the same measurement window.

### Assignment Eligibility

Before assigning a job, the aggregator should evaluate:

- Supported chain
- Supported check type
- Monitor status
- Monitor software version
- Region
- Cloud provider
- ASN
- Existing load
- Recent reliability
- Endpoint access restrictions
- Whether the monitor is already assigned to the endpoint
- Whether assignment improves infrastructure diversity

The scheduler should prefer assignments that increase geographic, cloud-provider, and ASN diversity.

### Configuration Model

The monitor binary should receive only bootstrap configuration locally:

```yaml
monitor:
  id: monitor-mumbai-01
  region: ap-south
  country: IN
  cloudProvider: aws
  asn: AS16509

aggregator:
  url: https://api.example.com
  apiKeyEnv: MONITOR_API_KEY

runtime:
  queuePath: /var/lib/rpc-monitor/reports.db
  pollJobsIntervalSeconds: 30
  logLevel: info
```

RPC endpoint jobs should normally be fetched dynamically from the aggregator instead of being permanently defined in local configuration.

Local static endpoint configuration may be supported only for development and debugging.

### Local Development

For local testing, run multiple instances from the same source tree with separate configuration and data directories:

```text
services/monitor-node/
├── configs/
│   ├── monitor-local-1.yaml
│   ├── monitor-local-2.yaml
│   └── monitor-local-3.yaml
└── data/
    ├── monitor-local-1/
    ├── monitor-local-2/
    └── monitor-local-3/
```

Example:

```bash
./monitor-node --config configs/monitor-local-1.yaml
./monitor-node --config configs/monitor-local-2.yaml
./monitor-node --config configs/monitor-local-3.yaml
```

Each local instance must use:

- A different monitor ID
- A different private key
- A different API credential
- A separate local queue path
- Separate logs

### Production Deployment

Build one versioned Docker image:

```text
rpc-monitor:0.1.0
```

Deploy the same image independently:

```bash
docker run -d \
  --name rpc-monitor \
  --restart unless-stopped \
  --env-file /etc/rpc-monitor/monitor.env \
  -v /var/lib/rpc-monitor:/app/data \
  rpc-monitor:0.1.0
```

Every server must have its own environment file, signing key, API credential, persistent volume, and monitor identity.

Updating monitor software should involve publishing a new versioned image and rolling it out gradually. The aggregator must record the software version included in every report.

### Acceptance Criteria

- The repository contains only one monitor-node implementation.
- Multiple independent instances can run from the same binary or Docker image.
- One monitor can process jobs for multiple RPC endpoints.
- One RPC endpoint can be assigned to multiple monitors.
- Assignments are stored and managed by the aggregator.
- The scheduler enforces configurable monitor quorum.
- The scheduler prefers regional, cloud-provider, and ASN diversity.
- A single monitor failure does not automatically classify the endpoint as unavailable.
- Local instances use separate identities, keys, queues, and configurations.
- Production instances can be deployed independently without changing source code.

---

## 9. Report Validation Pipeline

The aggregator must validate reports in this order:

1. Validate request schema.
2. Authenticate monitor API credentials.
3. Verify monitor status.
4. Verify monitor signature.
5. Verify payload hash.
6. Confirm endpoint and job exist.
7. Verify the monitor was assigned to the job.
8. Reject duplicate report IDs.
9. Reject reused nonces.
10. Reject stale reports.
11. Reject reports too far in the future.
12. Validate measurement window.
13. Validate chain ID.
14. Validate latency and numeric ranges.
15. Validate software version compatibility.
16. Store the report.
17. Mark it accepted or rejected.
18. Send accepted reports to the aggregation queue.

Rejected reports must remain stored for audit purposes, but must not affect provider metrics.

---

## 10. Aggregation Rules

Use fixed measurement windows, such as one-minute or five-minute buckets.

For each endpoint and check type:

1. Collect accepted reports for the same window.
2. Require a minimum number of independent monitors.
3. Require geographic or infrastructure diversity where possible.
4. Calculate median latency.
5. Calculate p50, p95, and p99 latency.
6. Calculate success rate.
7. Calculate error rate.
8. Calculate median block number.
9. Calculate block delay relative to reference consensus.
10. Detect outliers using median absolute deviation.
11. Exclude reports outside configured thresholds.
12. Store the final aggregate.

Suggested MVP quorum:

```text
Assigned monitors: 5
Minimum valid reports: 3
Minimum distinct regions: 2
Maximum reports from one cloud provider: 2
```

Suggested latency outlier method:

```text
median = median(latencies)
MAD = median(abs(latency - median))
reject if abs(latency - median) > max(3 * MAD, fixed_threshold)
```

Do not use a simple arithmetic average for consensus-sensitive latency.

---

## 11. Reference Provider Logic

Block freshness cannot be evaluated using one provider as the source of truth.

Use at least three reference RPC providers per chain.

For each measurement window:

1. Query all available reference providers.
2. Collect successful block numbers.
3. Use the median block number as the reference.
4. Calculate the tested endpoint's block delay.
5. Mark the reference result unreliable if quorum is unavailable.

Reference providers must not be included in SLA calculations when the reference quorum is unreliable.

---

## 12. Merkle Commitment Design

Detailed monitoring reports remain in PostgreSQL.

At a configured interval:

1. Select accepted reports not yet committed.
2. Sort them deterministically.
3. Hash each canonical report.
4. Build a Merkle tree.
5. Store the Merkle root and batch metadata.
6. Publish the root to the smart contract.
7. Store the transaction hash.
8. Mark reports as committed.

Leaf format:

```text
keccak256(
    abi.encode(
        reportId,
        monitorAddress,
        endpointIdHash,
        payloadHash,
        measurementWindow
    )
)
```

The API must support generating a Merkle proof for any committed report.

---

## 13. Smart Contract Scope

Create three initial contracts.

### 13.1 ProviderRegistry

Responsibilities:

- Register providers
- Register endpoint identifiers
- Associate provider wallets
- Store endpoint metadata hashes
- Activate or deactivate providers
- Emit events for provider and endpoint changes

Do not store private RPC URLs on-chain.

Suggested interface:

```solidity
interface IProviderRegistry {
    function registerProvider(bytes32 providerId, bytes32 metadataHash) external;
    function registerEndpoint(
        bytes32 endpointId,
        bytes32 providerId,
        uint256 chainId,
        bytes32 metadataHash
    ) external;
    function setEndpointStatus(bytes32 endpointId, bool active) external;
}
```

### 13.2 ReportCommitmentRegistry

Responsibilities:

- Store Merkle roots
- Prevent duplicate batch IDs
- Record report count and time range
- Authorize approved aggregator publishers
- Emit commitment events

Suggested data:

```solidity
struct ReportBatch {
    bytes32 merkleRoot;
    uint64 startTime;
    uint64 endTime;
    uint32 reportCount;
    address publisher;
}
```

Suggested functions:

```solidity
function publishBatch(
    bytes32 batchId,
    bytes32 merkleRoot,
    uint64 startTime,
    uint64 endTime,
    uint32 reportCount
) external;

function verifyReport(
    bytes32 batchId,
    bytes32 leaf,
    bytes32[] calldata proof
) external view returns (bool);
```

### 13.3 SLARegistry

MVP responsibilities:

- Register SLA metadata
- Store SLA thresholds
- Associate customer and provider
- Store evaluation evidence roots
- Record whether an evaluation passed or failed
- Emit SLA evaluation events

The MVP contract should not transfer money.

Suggested SLA fields:

```solidity
struct SLA {
    bytes32 endpointId;
    address provider;
    address customer;
    uint64 startTime;
    uint64 endTime;
    uint32 minimumUptimeBps;
    uint32 maximumErrorRateBps;
    uint32 maximumMedianLatencyMs;
    uint32 maximumP95LatencyMs;
    uint32 maximumBlockDelay;
    bool active;
}
```

Future versions may add escrow and compensation.

---

## 14. Smart Contract Security Requirements

- Use role-based access control.
- Separate admin and report-publisher roles.
- Use custom errors.
- Apply checks-effects-interactions.
- Avoid unbounded loops.
- Do not store dynamic report arrays on-chain.
- Prevent duplicate SLA and batch IDs.
- Validate all timestamps and ranges.
- Use basis points for percentages.
- Emit events for all state changes.
- Write fuzz tests.
- Write invariant tests.
- Test unauthorized calls.
- Test duplicate commitments.
- Test malformed proofs.
- Test expired SLAs.
- Test boundary values.
- Run Slither before release.
- Run Foundry coverage.
- Keep contracts non-upgradeable for the MVP.

---

## 15. API Modules

### Authentication

- Provider account authentication
- Admin authentication
- Monitor API-key authentication
- Wallet-signature login for provider accounts

### Providers

```text
POST   /providers
GET    /providers
GET    /providers/:id
PATCH  /providers/:id
```

### Endpoints

```text
POST   /providers/:providerId/endpoints
GET    /endpoints
GET    /endpoints/:id
PATCH  /endpoints/:id
DELETE /endpoints/:id
```

### Monitors

```text
POST   /monitors/register
POST   /monitors/heartbeat
GET    /monitors/me/jobs
POST   /monitors/reports
GET    /monitors/me/status
```

### Metrics

```text
GET /providers/:id/metrics
GET /endpoints/:id/metrics
GET /endpoints/:id/availability
GET /endpoints/:id/latency
GET /endpoints/:id/errors
GET /endpoints/:id/block-freshness
```

### Reports

```text
GET /reports/:reportId
GET /reports/:reportId/proof
GET /report-batches/:batchId
```

### SLAs

```text
POST /slas
GET  /slas
GET  /slas/:id
GET  /slas/:id/evaluations
POST /slas/:id/evaluate
```

All list endpoints must support pagination.

---

## 16. Dashboard Pages

### Public Pages

- Provider directory
- Provider details
- Endpoint performance
- Chain-specific provider comparison
- Uptime history
- Latency charts
- Error-rate charts
- Block freshness charts
- Published Merkle commitment details
- Public SLA verification page

### Provider Pages

- Provider profile
- Endpoint management
- API credential management
- SLA creation
- SLA evaluation history
- Incident history
- Monitor-region performance
- Report export

### Admin Pages

- Monitor registry
- Monitor health
- Provider moderation
- Endpoint status
- Rejected reports
- Aggregation health
- Merkle batch status
- Contract publication status
- Queue status

---

## 17. SLA Evaluation Rules

An SLA must define:

- Evaluation start and end time
- Evaluation window size
- Minimum uptime
- Maximum error rate
- Maximum median latency
- Maximum p95 latency
- Maximum block delay
- Minimum monitor quorum
- Allowed excluded maintenance windows

Example:

```text
Evaluation period: 30 days
Window size: 5 minutes
Minimum uptime: 99.90%
Maximum error rate: 0.50%
Maximum median latency: 250 ms
Maximum p95 latency: 600 ms
Maximum block delay: 2 blocks
Minimum valid monitors per window: 3
```

Rules:

- A window without monitor quorum is marked inconclusive.
- Inconclusive windows must not automatically count as provider downtime.
- The SLA must define the maximum allowed inconclusive percentage.
- Scheduled maintenance must be declared before the maintenance begins.
- Maintenance exclusions must be auditable.
- Evaluation results must include evidence hashes.

---

## 18. Security Threat Model

Document and mitigate the following:

### Sybil Monitors

Risk:

One operator creates many monitors to influence results.

MVP mitigation:

- Permissioned monitor registration
- Manual monitor approval
- Cloud-provider and ASN diversity
- API credentials
- Unique signing keys
- Region verification

### False Reports

Risk:

A monitor submits fabricated measurements.

Mitigation:

- Multi-monitor quorum
- Signature verification
- Outlier detection
- Reputation scoring
- Challenge jobs
- Compare reports from nearby regions
- Store rejected evidence

### Replay Attacks

Mitigation:

- Unique report IDs
- Per-monitor nonces
- Measurement windows
- Expiration checks
- Duplicate payload detection

### Endpoint Manipulation

Risk:

A provider serves better responses only to known monitor IP addresses.

Mitigation:

- Rotate monitor servers
- Use undisclosed monitor IPs
- Support residential or partner monitors later
- Randomize request timing
- Use multiple check patterns
- Compare public customer reports

### Aggregator Compromise

Mitigation:

- Signed monitor reports
- Immutable report hashes
- Merkle commitments
- Append-only audit logs
- Separate publisher key
- Multisig contract administration
- Rebuild aggregates from raw reports

### Clock Manipulation

Mitigation:

- NTP checks
- Record local clock offset
- Reject monitors with excessive drift
- Compare receipt time against signed timestamps

### Secret Leakage

Mitigation:

- Encrypt private RPC URLs
- Redact tokens from logs
- Use a secret manager in production
- Never expose full authenticated endpoint URLs to monitors unless required
- Rotate provider credentials

---

## 19. Testing Strategy

### Monitor Node Tests

- Unit tests for each check type
- HTTP timeout tests
- Invalid JSON tests
- Wrong chain ID tests
- WebSocket reconnect tests
- Signature tests
- Nonce persistence tests
- Local queue persistence tests
- Clock-drift tests

### Backend Tests

- Schema validation
- Signature verification
- Duplicate report rejection
- Stale report rejection
- Nonce replay rejection
- Aggregation calculations
- Outlier detection
- Reference-provider quorum
- Merkle root generation
- Merkle proof generation
- SLA evaluation
- API authorization
- Database transaction rollback

### Contract Tests

- Provider registration
- Endpoint registration
- Role permissions
- Report root publishing
- Duplicate batch rejection
- Merkle proof verification
- SLA registration
- SLA expiration
- Evidence publication
- Fuzz tests
- Invariant tests

### Integration Tests

- Monitor sends signed report
- API verifies and stores report
- Worker aggregates reports
- Worker builds Merkle tree
- Root is committed on Anvil
- Dashboard displays aggregate metrics
- SLA evaluation references committed evidence

### Load Tests

Simulate:

- 100 monitors
- 1,000 endpoints
- One-minute polling
- At least 100,000 reports per hour

Measure:

- API throughput
- Queue delay
- Database write latency
- Aggregation duration
- Merkle batch duration
- Memory usage
- Failure recovery

---

## 20. Local Development Setup

The local stack should include:

```text
PostgreSQL
Redis
API
Worker
Dashboard
Anvil
Three local monitor processes
Prometheus
Grafana
```

Use Docker only for PostgreSQL, Redis, Prometheus, and Grafana where possible.

Run Foundry, Next.js, API, worker, and monitor processes directly during development to reduce Docker memory usage.

Provide:

```bash
make install
make dev-infra
make dev-api
make dev-worker
make dev-dashboard
make dev-monitor-1
make dev-monitor-2
make dev-monitor-3
make test
make lint
make contracts-test
```

---

## 21. Environment Variables

### API

```text
DATABASE_URL=
REDIS_URL=
JWT_SECRET=
ENCRYPTION_KEY=
BASE_SEPOLIA_RPC_URL=
REPORT_COMMITMENT_CONTRACT=
PROVIDER_REGISTRY_CONTRACT=
SLA_REGISTRY_CONTRACT=
PUBLISHER_PRIVATE_KEY=
```

### Monitor

```text
MONITOR_ID=
MONITOR_PRIVATE_KEY=
MONITOR_API_KEY=
AGGREGATOR_URL=
MONITOR_REGION=
MONITOR_COUNTRY=
MONITOR_CLOUD_PROVIDER=
MONITOR_ASN=
REPORT_QUEUE_PATH=
LOG_LEVEL=
```

### Dashboard

```text
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_CHAIN_ID=
NEXT_PUBLIC_REPORT_COMMITMENT_CONTRACT=
```

Never commit real secrets.

Provide `.env.example` files.

---

## 22. CI/CD Requirements

GitHub Actions workflows:

### TypeScript

- Install dependencies
- Lint
- Type-check
- Unit tests
- Integration tests
- Build API
- Build worker
- Build dashboard

### Go

- Format check
- Vet
- Unit tests
- Race detector
- Build Linux binary
- Build Docker image

### Solidity

- Forge formatting
- Forge build
- Forge tests
- Forge coverage
- Slither

### Deployment

- Build versioned Docker images
- Push images to registry
- Deploy staging API
- Deploy staging worker
- Deploy staging dashboard
- Deploy test monitor nodes
- Run database migrations
- Run smoke tests

No production deployment should happen automatically from unreviewed pull requests.

---

## 23. Development Milestones

## Phase 0 — Project Foundation

Tasks:

- Create monorepo
- Configure pnpm workspace
- Create Go monitor service
- Create Foundry project
- Add Docker Compose
- Add PostgreSQL and Redis
- Add linting and formatting
- Add CI skeleton
- Write architecture documentation
- Write threat model

Acceptance criteria:

- All applications build
- CI passes
- Local PostgreSQL and Redis start successfully
- Anvil starts
- Empty dashboard and API run locally

---

## Phase 1 — Basic RPC Monitor

Tasks:

- Implement monitor configuration
- Implement `eth_chainId`
- Implement `eth_blockNumber`
- Implement HTTP availability checks
- Add latency measurement
- Add error categorization
- Add report model
- Add canonical serialization
- Add secp256k1 signing
- Add local unsent-report queue
- Add heartbeat endpoint

Acceptance criteria:

- Three local monitor processes can test one RPC endpoint
- Reports are signed
- Failed submissions are retried
- Monitor survives restart without losing queued reports

---

## Phase 2 — Aggregator API

Tasks:

- Add database schema
- Add monitor registration
- Add monitor authentication
- Add endpoint registration
- Add job assignment
- Add report ingestion
- Verify signatures
- Reject replayed reports
- Reject stale reports
- Store accepted and rejected reports
- Add structured logs
- Add Prometheus metrics

Acceptance criteria:

- Valid signed reports are accepted
- Invalid signatures are rejected
- Duplicate IDs and nonces are rejected
- Reports are queryable from PostgreSQL

---

## Phase 3 — Aggregation Engine

Tasks:

- Create aggregation worker
- Implement measurement windows
- Implement quorum requirements
- Calculate uptime
- Calculate p50 and p95 latency
- Implement outlier detection
- Implement block freshness
- Add reference-provider consensus
- Store aggregates
- Add scheduled reprocessing

Acceptance criteria:

- Aggregates are reproducible from raw reports
- Outlier reports do not distort metrics
- Missing quorum creates an inconclusive result
- Block-delay calculations use reference consensus

---

## Phase 4 — Dashboard

Tasks:

- Create provider directory
- Create endpoint details page
- Add uptime chart
- Add latency chart
- Add error-rate chart
- Add block-delay chart
- Add monitor-region table
- Add incident timeline
- Add admin monitor-health page

Acceptance criteria:

- Users can inspect provider metrics
- Charts use aggregated data
- Public pages do not reveal private RPC URLs
- Admin can identify offline or misbehaving monitors

---

## Phase 5 — Merkle Commitments

Tasks:

- Implement deterministic report hashing
- Implement Merkle tree package
- Create ReportCommitmentRegistry contract
- Add role-based publisher authorization
- Add Foundry tests
- Add root publication worker
- Store transaction hashes
- Implement Merkle proof API
- Add dashboard verification page

Acceptance criteria:

- Accepted report batches are committed on Base Sepolia
- A report proof can be generated and verified
- Duplicate batch publication is rejected
- Dashboard shows commitment transaction and verification result

---

## Phase 6 — SLA Registry and Evaluation

Tasks:

- Create SLA database models
- Create SLARegistry contract
- Add SLA creation API
- Implement SLA evaluation worker
- Add evidence-root generation
- Publish evaluation result on-chain
- Add SLA dashboard
- Add downloadable SLA report

Acceptance criteria:

- A provider and customer can define an SLA
- The backend evaluates the SLA for a selected period
- Violation reasons are explicit
- Evaluation evidence is committed on-chain
- Results can be independently verified

---

## Phase 7 — Distributed Deployment

Tasks:

- Deploy API and worker to staging
- Deploy PostgreSQL and Redis
- Deploy monitors to at least three servers
- Use at least three regions
- Use at least two cloud providers
- Configure TLS
- Configure Prometheus and Grafana
- Add alerting
- Run seven-day reliability test

Suggested staging topology:

```text
Monitor 1: Mumbai
Monitor 2: Singapore
Monitor 3: Frankfurt
Monitor 4: US East
Monitor 5: Local or another provider
```

Acceptance criteria:

- Monitoring continues through individual monitor failures
- Reports arrive from independent regions
- Queue recovery works
- Aggregates remain available
- Seven-day monitoring data is retained

---

## Phase 8 — Optional Financial Settlement

Only start after the monitoring system is stable.

Tasks:

- Design escrow contract
- Support stablecoin deposits
- Define deterministic compensation rules
- Add dispute period
- Add emergency pause
- Add provider collateral
- Add customer subscription payments
- Add settlement tests
- Conduct external security review

Do not allow the backend to transfer funds directly.

All settlement conditions must be represented in contract state or verifiable evidence.

---

## 24. Initial Codex Task Order

Codex should implement work in the following order.

### Task 1

Create the monorepo structure, workspace files, root scripts, formatting, linting, and Docker Compose for PostgreSQL and Redis.

### Task 2

Create the Go monitor service with:

- Configuration loading
- Structured logging
- Health endpoint
- Graceful shutdown
- `eth_chainId`
- `eth_blockNumber`
- HTTP latency measurement
- Unit tests

### Task 3

Create canonical report types in both Go and TypeScript.

Ensure test vectors prove that both implementations produce the same payload hash.

### Task 4

Implement secp256k1 signing in Go and verification in TypeScript.

Add shared test vectors.

### Task 5

Create the PostgreSQL schema and migrations.

### Task 6

Create monitor registration, heartbeat, job assignment, and report-ingestion API endpoints.

### Task 7

Implement replay protection, signature validation, timestamp validation, and report persistence.

### Task 8

Implement aggregation worker and unit tests.

### Task 9

Implement provider and endpoint APIs.

### Task 10

Create the initial Next.js dashboard.

### Task 11

Implement the ReportCommitmentRegistry contract and Foundry tests.

### Task 12

Implement Merkle batching, root publication, and proof generation.

### Task 13

Implement SLA models, evaluation logic, and SLARegistry contract.

### Task 14

Deploy the staging system and independent monitors.

---

## 25. Coding Standards for Codex

Codex must follow these rules:

- Do not generate placeholder functions without tracking them.
- Do not silently ignore errors.
- Do not use `any` in TypeScript without justification.
- Use strict TypeScript mode.
- Use context cancellation in Go.
- Use structured logging.
- Validate all external input.
- Use database transactions where atomicity is required.
- Keep functions small and testable.
- Write tests with every feature.
- Do not place business logic in HTTP handlers.
- Do not expose secrets in logs.
- Do not hard-code private keys.
- Do not store full authenticated RPC URLs in public tables.
- Do not introduce upgradeable contracts in the MVP.
- Use custom Solidity errors.
- Use NatSpec for public Solidity interfaces.
- Format code before every commit.
- Keep pull requests focused.
- Update documentation when behavior changes.

---

## 26. Definition of Done

A task is complete only when:

- Code is implemented.
- Tests are added.
- Tests pass.
- Linting passes.
- Type-checking passes.
- Documentation is updated.
- Environment variables are documented.
- Errors are handled.
- Security implications are considered.
- No secrets are committed.
- Acceptance criteria are demonstrated.

---

## 27. MVP Demo Scenario

The final MVP demonstration should:

1. Register three RPC providers.
2. Register at least one endpoint per provider.
3. Run five monitors across at least three regions.
4. Monitor Base Sepolia RPC endpoints for seven days.
5. Collect:
   - Uptime
   - Median latency
   - P95 latency
   - Error rate
   - Block delay
6. Display provider comparisons.
7. Create one SLA.
8. Detect at least one simulated SLA violation.
9. Commit report evidence to Base Sepolia.
10. Generate and verify a Merkle proof.
11. Publish an SLA evaluation result.
12. Export a human-readable SLA report.

---

## 28. Future Extensions

After the MVP:

- Permissionless monitor staking
- Monitor reputation
- Slashing for provably false reports
- Automated stablecoin compensation
- Provider subscription marketplace
- Decentralized governance
- IPFS or Arweave evidence storage
- BGP route monitoring
- DNS monitoring
- TLS certificate monitoring
- Multi-chain sequencer monitoring
- Validator monitoring
- Bridge relayer monitoring
- Decentralized VPN monitoring
- Customer-side SDK
- Browser-based monitoring
- Mobile monitor nodes
- Trusted execution environment attestation
- Zero-knowledge proofs for private endpoint testing
- Machine-learning anomaly detection
- Public provider ranking API

---

## 29. Product Positioning

The product should initially be presented as:

> Independent, cryptographically verifiable performance monitoring for blockchain RPC infrastructure.

Do not initially position it as a punishment or slashing platform.

Primary provider benefits:

- Independent proof of reliability
- Transparent performance history
- Stronger enterprise SLA reporting
- Reduced customer disputes
- Public performance certification
- Competitive differentiation

Primary customer benefits:

- Independent monitoring
- Verifiable evidence
- Provider comparison
- Faster incident detection
- Auditable SLA reports
- Optional automated compensation in future versions

---

## 30. Final MVP Success Criteria

The MVP is successful when:

- Distributed monitors reliably submit signed measurements.
- The aggregator rejects invalid and replayed reports.
- Metrics are calculated from multiple independent monitors.
- Provider performance is visible through a dashboard.
- Raw reports can be cryptographically proven through Merkle commitments.
- SLA evaluations are reproducible and auditable.
- The complete system runs locally and in staging.
- At least three geographically distributed monitors operate continuously.
- The architecture can later support optional financial settlement without redesigning the monitoring core.
