# RPC SLA Platform

A decentralized RPC monitoring and SLA verification platform. The system runs independent monitor nodes against blockchain JSON-RPC endpoints, signs every measurement report, sends reports to an aggregator, and prepares the data model for quorum-based SLA evaluation and on-chain evidence commitments.

## Current Status

Phases 0 through 6 are implemented locally. The platform monitors RPC endpoints, aggregates signed reports, commits report evidence, and evaluates time-bounded SLAs.

Implemented:

- npm workspace monorepo
- Fastify API with health, monitor heartbeat, and development report intake routes
- Next.js dashboard shell
- BullMQ-ready worker shell
- Go monitor node with health endpoint
- Go monitor config loading from environment variables or YAML
- JSON-RPC checks for HTTP availability, `eth_chainId`, and `eth_blockNumber`
- Canonical monitor report payloads
- Keccak payload hashing and secp256k1 signing
- Local JSONL report queue with retry submission
- PostgreSQL schema for providers, endpoints, monitors, jobs, and reports
- API report validation with duplicate, nonce, freshness, payload hash, and signature checks
- API persistence for accepted and rejected monitor reports
- Worker aggregation for fixed measurement windows, quorum, uptime/error rate, p50/p95/p99 latency, and simple outlier filtering
- Merkle batching, report proof APIs, and the `ReportCommitmentRegistry` contract
- SLA creation, deterministic evaluation, explicit violation reasons, and evidence proofs
- `SLARegistry` contract publication and downloadable SLA reports
- Data-backed provider, endpoint, monitor, report, and SLA dashboard views
- Prometheus-style API metrics endpoint
- Foundry contract scaffold
- Docker Compose for PostgreSQL, Redis, Prometheus, and Grafana
- CI skeleton
- Architecture and threat model docs

## Repository Layout

```text
apps/
  api/                 Fastify API
  dashboard/           Next.js dashboard
  worker/              Background worker
packages/
  shared-types/        Shared TypeScript types
  validation/          Shared validation helpers
  crypto/              Crypto helpers
  merkle/              Merkle helpers
  sla/                 Deterministic SLA evaluation and evidence hashing
  database/            Database package scaffold
  contract-bindings/   Contract ABI bindings
services/
  monitor-node/        Go monitor service
contracts/             Foundry Solidity project
docs/                  Architecture and security docs
infrastructure/        Local observability config
```

## Prerequisites

- Node.js 22 or newer
- npm
- Go
- Foundry
- Docker Desktop, for local PostgreSQL and Redis

## Setup

```bash
npm install
cp .env.example .env
```

Start local infrastructure:

```bash
make dev-infra
```

The API runs migrations automatically on startup when `DATABASE_URL` is set.

Start the API:

```bash
make dev-api
```

Start the dashboard:

```bash
make dev-dashboard
```

Start the worker:

```bash
make dev-worker
```

## Running A Monitor

The monitor needs a development private key and an RPC endpoint URL.

```bash
MONITOR_PRIVATE_KEY=0x... MONITOR_RPC_HTTP_URL=https://your-rpc.example make dev-monitor-1
```

Run additional local monitor instances from the same codebase:

```bash
MONITOR_PRIVATE_KEY=0x... MONITOR_RPC_HTTP_URL=https://your-rpc.example make dev-monitor-2
MONITOR_PRIVATE_KEY=0x... MONITOR_RPC_HTTP_URL=https://your-rpc.example make dev-monitor-3
```

Each target uses a separate monitor ID, health port, and local report queue path.

## Useful Commands

```bash
make install          # npm install
make build            # build all npm workspaces
make lint             # lint all npm workspaces
make test             # Go tests plus npm tests
make go-test          # Go monitor tests
make contracts-build  # Foundry build
make contracts-test   # Foundry tests
```

Direct npm commands:

```bash
npm run typecheck
npm run lint
npm run build
npm run test
npm run format
```

## Local URLs

- API health: http://localhost:4000/healthz
- API readiness: http://localhost:4000/readyz
- API summary: http://localhost:4000/summary
- API metrics: http://localhost:4000/metrics
- API aggregates: http://localhost:4000/aggregates
- API SLAs: http://localhost:4000/slas
- Dashboard: http://localhost:3000
- Monitor 1 health: http://localhost:8081/healthz
- Monitor 2 health: http://localhost:8082/healthz
- Monitor 3 health: http://localhost:8083/healthz

## Create And Evaluate An SLA

The period uses Unix timestamps in seconds. Register the endpoint first, and use an end time that has passed when testing immediate evaluation.

```bash
curl -X POST http://localhost:4000/slas \
  -H 'content-type: application/json' \
  -d '{
    "providerId": "local-provider",
    "customerId": "customer-1",
    "endpointId": "endpoint-local-1",
    "periodStart": 1785154440,
    "periodEnd": 1785158040,
    "minimumUptime": 0.99,
    "maximumP95LatencyMs": 500,
    "maximumErrorRate": 0.01
  }'
```

Run `make dev-worker`. The worker stores a `passed`, `violated`, or `inconclusive` result. Download the audit artifact from `GET /slas/:slaId/report`, or verify each evidence leaf with `GET /sla-evaluations/:evaluationId/proof`.

For Base Sepolia publication, deploy `contracts/src/SLARegistry.sol` and set `SLA_REGISTRY_CONTRACT`, `PUBLISHER_PRIVATE_KEY`, and `BASE_SEPOLIA_RPC_URL`. Include `providerAddress` and `customerAddress` in the SLA creation request.

## Development Notes

- Use npm workspaces, not pnpm.
- Do not commit real secrets.
- Do not expose authenticated RPC URLs publicly.
- The MVP uses one shared Go monitor implementation for all monitor instances.
- Set `MONITOR_API_KEY` in both the API and monitor environment to require bearer-token auth for monitor routes.
- Set `STRICT_JOB_VALIDATION=true` to reject reports unless an active measurement job exists.
- Without `DATABASE_URL`, the API still accepts valid reports in development mode but does not persist them.

## Roadmap

See [phases.md](./phases.md) for the full phase plan.

The next planned milestone is Phase 7: distributed staging deployment, independent regions, TLS, observability, alerting, and a seven-day reliability run.
