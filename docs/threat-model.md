# Threat Model

## Sybil Monitors

The MVP uses permissioned monitor registration, unique API credentials, signing keys, and infrastructure diversity checks.

## False Reports

Reports must be signed, validated against assigned jobs, checked for replay, and aggregated with quorum and outlier rejection.

## Replay Attacks

Reports include unique IDs, nonces, measurement windows, and signed payload hashes. Duplicate and stale reports are rejected.

## Endpoint Manipulation

The platform compares measurements across regions, cloud providers, and ASNs. Future phases may rotate monitor infrastructure.

## Aggregator Compromise

Raw reports are signed by monitors and committed through Merkle roots so aggregates can be rebuilt and audited.

## Secret Leakage

Private RPC URLs and credentials must not be logged or exposed publicly. Real secrets must never be committed.
