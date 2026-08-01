import { buildMerkleTree } from "@rpc-sla/merkle";
import { encodeAbiParameters, keccak256, parseAbiParameters, stringToHex } from "viem";

export interface SlaTerms {
  id: string;
  endpointId: string;
  periodStart: number;
  periodEnd: number;
  minimumUptime: number;
  maximumP95LatencyMs?: number;
  maximumErrorRate?: number;
  maximumBlockDelay?: number;
}

export interface SlaAggregateEvidence {
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

export interface SlaMetrics {
  uptime: number;
  errorRate: number;
  p95LatencyMs?: number;
  maximumBlockDelay?: number;
  aggregateWindows: number;
  validReports: number;
}

export interface SlaEvaluationResult {
  status: "passed" | "violated" | "inconclusive";
  metrics: SlaMetrics;
  reasons: string[];
  evidenceRoot: `0x${string}`;
  evidence: Array<SlaAggregateEvidence & { leafHash: `0x${string}`; leafIndex: number }>;
}

export function evaluateSla(
  terms: SlaTerms,
  aggregates: SlaAggregateEvidence[]
): SlaEvaluationResult {
  const evidence = aggregates
    .filter(
      (aggregate) =>
        aggregate.endpointId === terms.endpointId &&
        aggregate.windowStart >= terms.periodStart &&
        aggregate.windowEnd <= terms.periodEnd
    )
    .sort(compareEvidence);

  const leaves = evidence.map(evidenceLeaf);
  const tree = buildMerkleTree(leaves);
  const indexedEvidence = evidence.map((item, index) => ({
    ...item,
    leafHash: leaves[index]!,
    leafIndex: index,
  }));
  const validReports = evidence.reduce((sum, item) => sum + item.validReportCount, 0);
  const uptimeEvidence = evidence.filter((item) => item.checkType === "HTTP_AVAILABILITY");
  const uptimeWeight = uptimeEvidence.reduce((sum, item) => sum + item.validReportCount, 0);
  const uptime =
    uptimeWeight === 0
      ? 0
      : uptimeEvidence.reduce((sum, item) => sum + item.successRate * item.validReportCount, 0) /
        uptimeWeight;
  const errorRate =
    uptimeWeight === 0
      ? 0
      : uptimeEvidence.reduce((sum, item) => sum + item.errorRate * item.validReportCount, 0) /
        uptimeWeight;
  const latencyValues = evidence.flatMap((item) =>
    item.p95LatencyMs === undefined ? [] : [item.p95LatencyMs]
  );
  const blockDelayValues = evidence.flatMap((item) =>
    item.medianBlockDelay === undefined ? [] : [item.medianBlockDelay]
  );
  const metrics: SlaMetrics = {
    uptime,
    errorRate,
    p95LatencyMs: latencyValues.length === 0 ? undefined : Math.max(...latencyValues),
    maximumBlockDelay: blockDelayValues.length === 0 ? undefined : Math.max(...blockDelayValues),
    aggregateWindows: evidence.length,
    validReports,
  };
  const reasons: string[] = [];

  if (evidence.length === 0) reasons.push("No aggregate windows exist for the SLA period.");
  if (uptimeEvidence.length === 0) reasons.push("No HTTP availability evidence exists.");
  if (evidence.some((item) => item.status === "inconclusive")) {
    reasons.push("At least one aggregate window did not meet monitor quorum.");
  }

  if (reasons.length > 0) {
    return {
      status: "inconclusive",
      metrics,
      reasons,
      evidenceRoot: tree.root,
      evidence: indexedEvidence,
    };
  }

  if (uptime < terms.minimumUptime) {
    reasons.push(
      `Uptime ${(uptime * 100).toFixed(3)}% is below ${(terms.minimumUptime * 100).toFixed(3)}%.`
    );
  }
  if (terms.maximumErrorRate !== undefined && errorRate > terms.maximumErrorRate) {
    reasons.push(
      `Error rate ${(errorRate * 100).toFixed(3)}% exceeds ${(terms.maximumErrorRate * 100).toFixed(3)}%.`
    );
  }
  if (
    terms.maximumP95LatencyMs !== undefined &&
    metrics.p95LatencyMs !== undefined &&
    metrics.p95LatencyMs > terms.maximumP95LatencyMs
  ) {
    reasons.push(`p95 latency ${metrics.p95LatencyMs} ms exceeds ${terms.maximumP95LatencyMs} ms.`);
  }
  if (
    terms.maximumBlockDelay !== undefined &&
    metrics.maximumBlockDelay !== undefined &&
    metrics.maximumBlockDelay > terms.maximumBlockDelay
  ) {
    reasons.push(
      `Block delay ${metrics.maximumBlockDelay} exceeds ${terms.maximumBlockDelay} blocks.`
    );
  }

  return {
    status: reasons.length === 0 ? "passed" : "violated",
    metrics,
    reasons,
    evidenceRoot: tree.root,
    evidence: indexedEvidence,
  };
}

export function evidenceLeaf(evidence: SlaAggregateEvidence): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters(
        "bytes32 endpointIdHash, bytes32 checkTypeHash, uint256 windowStart, uint256 windowEnd, uint256 validReportCount, uint256 successRatePpm, uint256 errorRatePpm, uint256 p95LatencyMs, int256 medianBlockDelay, bytes32 statusHash"
      ),
      [
        keccak256(stringToHex(evidence.endpointId)),
        keccak256(stringToHex(evidence.checkType)),
        BigInt(evidence.windowStart),
        BigInt(evidence.windowEnd),
        BigInt(evidence.validReportCount),
        BigInt(Math.round(evidence.successRate * 1_000_000)),
        BigInt(Math.round(evidence.errorRate * 1_000_000)),
        BigInt(Math.round(evidence.p95LatencyMs ?? 0)),
        BigInt(Math.round(evidence.medianBlockDelay ?? 0)),
        keccak256(stringToHex(evidence.status)),
      ]
    )
  );
}

export function slaTermsHash(terms: SlaTerms): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters(
        "bytes32 slaIdHash, bytes32 endpointIdHash, uint256 periodStart, uint256 periodEnd, uint256 minimumUptimePpm, uint256 maximumP95LatencyMs, uint256 maximumErrorRatePpm, uint256 maximumBlockDelay"
      ),
      [
        keccak256(stringToHex(terms.id)),
        keccak256(stringToHex(terms.endpointId)),
        BigInt(terms.periodStart),
        BigInt(terms.periodEnd),
        BigInt(Math.round(terms.minimumUptime * 1_000_000)),
        BigInt(Math.round(terms.maximumP95LatencyMs ?? 0)),
        BigInt(Math.round((terms.maximumErrorRate ?? 0) * 1_000_000)),
        BigInt(Math.round(terms.maximumBlockDelay ?? 0)),
      ]
    )
  );
}

function compareEvidence(left: SlaAggregateEvidence, right: SlaAggregateEvidence): number {
  return (
    left.windowStart - right.windowStart ||
    left.checkType.localeCompare(right.checkType) ||
    left.windowEnd - right.windowEnd
  );
}
