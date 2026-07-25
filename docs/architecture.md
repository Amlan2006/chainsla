# Architecture

The RPC SLA Platform monitors blockchain JSON-RPC providers from independent monitor nodes, validates signed reports in a central aggregator, stores evidence in PostgreSQL, and periodically publishes Merkle commitments to EVM contracts.

## Components

- Monitor Node: Go service deployed independently per region or network path.
- API: Fastify service for provider, endpoint, monitor, report, metric, and SLA APIs.
- Worker: queue-driven TypeScript service for validation, aggregation, Merkle batching, and SLA evaluation.
- Dashboard: Next.js application for public, provider, and admin views.
- Contracts: Foundry-based Solidity contracts for provider metadata, report commitments, and SLA evidence.
- Infrastructure: Docker Compose for local PostgreSQL, Redis, Prometheus, and Grafana.

## Development Policy

Use npm workspaces for TypeScript packages and applications. Use one shared Go monitor implementation for all monitor instances.
