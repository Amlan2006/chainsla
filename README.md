# RPC SLA Platform

A decentralized RPC monitoring and SLA verification platform. The system runs independent monitor nodes against blockchain JSON-RPC endpoints, signs every measurement report, sends reports to an aggregator, and prepares the data model for quorum-based SLA evaluation and on-chain evidence commitments.

## Current Status

Phase 0 is scaffolded, Phase 1 monitor basics are implemented, and Phase 2 API persistence is underway.

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
- Dashboard: http://localhost:3000
- Monitor 1 health: http://localhost:8081/healthz
- Monitor 2 health: http://localhost:8082/healthz
- Monitor 3 health: http://localhost:8083/healthz

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

Immediate next work:

1. Add richer provider and endpoint APIs.
2. Add dashboard views for stored monitors and reports.
3. Move aggregation calculations into the worker.
4. Add quorum-aware aggregate windows.
5. Add Merkle batching for accepted reports.
