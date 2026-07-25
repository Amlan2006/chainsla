# RPC SLA Platform Phases

This file tracks the implementation phases from `plan(1).md`. The TypeScript monorepo should use npm workspaces, not pnpm.

## Phase 0 - Project Foundation

Tasks:

- Create monorepo
- Configure npm workspace
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

## Phase 1 - Basic RPC Monitor

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

## Phase 2 - Aggregator API

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

## Phase 3 - Aggregation Engine

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

## Phase 4 - Dashboard

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

## Phase 5 - Merkle Commitments

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

## Phase 6 - SLA Registry and Evaluation

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

## Phase 7 - Distributed Deployment

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

## Phase 8 - Optional Financial Settlement

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

Rules:

- Do not allow the backend to transfer funds directly
- All settlement conditions must be represented in contract state or verifiable evidence

## Initial Codex Task Order

1. Create the monorepo structure, workspace files, root scripts, formatting, linting, and Docker Compose for PostgreSQL and Redis.
2. Create the Go monitor service with configuration loading, structured logging, health endpoint, graceful shutdown, `eth_chainId`, `eth_blockNumber`, HTTP latency measurement, and unit tests.
3. Create canonical report types in both Go and TypeScript, with test vectors proving both implementations produce the same payload hash.
4. Implement secp256k1 signing in Go and verification in TypeScript, with shared test vectors.
5. Create the PostgreSQL schema and migrations.
6. Create monitor registration, heartbeat, job assignment, and report-ingestion API endpoints.
7. Implement replay protection, signature validation, timestamp validation, and report persistence.
8. Implement aggregation worker and unit tests.
9. Implement provider and endpoint APIs.
10. Create the initial Next.js dashboard.
11. Implement the ReportCommitmentRegistry contract and Foundry tests.
12. Implement Merkle batching, root publication, and proof generation.
13. Implement SLA models, evaluation logic, and SLARegistry contract.
14. Deploy the staging system and independent monitors.
