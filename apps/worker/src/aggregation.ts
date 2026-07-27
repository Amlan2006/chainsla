export interface AcceptedReport {
  reportId: string;
  monitorId: string;
  endpointId: string;
  checkType: string;
  measurementWindow: number;
  latencyMs: number;
  success: boolean;
  blockNumber?: number;
}

export interface AggregateWindow {
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
  status: "healthy" | "degraded" | "down" | "inconclusive";
  excludedReportCount: number;
  metadata: Record<string, unknown>;
}

export interface AggregationPolicy {
  minimumValidReports: number;
  minimumDistinctMonitors: number;
  windowSeconds: number;
  latencyOutlierFixedThresholdMs: number;
}

export function aggregateReports(
  reports: AcceptedReport[],
  policy: AggregationPolicy
): AggregateWindow[] {
  const groups = new Map<string, AcceptedReport[]>();

  for (const report of reports) {
    const windowStart = normalizeWindow(report.measurementWindow, policy.windowSeconds);
    const key = `${report.endpointId}\u0000${report.checkType}\u0000${windowStart}`;
    const group = groups.get(key) ?? [];
    group.push({ ...report, measurementWindow: windowStart });
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => aggregateGroup(group, policy));
}

function aggregateGroup(group: AcceptedReport[], policy: AggregationPolicy): AggregateWindow {
  const first = group[0];
  if (!first) {
    throw new Error("cannot aggregate empty group");
  }

  const monitorIds = new Set(group.map((report) => report.monitorId));
  const filtered = filterLatencyOutliers(group, policy.latencyOutlierFixedThresholdMs);
  const successCount = filtered.filter((report) => report.success).length;
  const successRate = filtered.length === 0 ? 0 : successCount / filtered.length;
  const errorRate = filtered.length === 0 ? 0 : 1 - successRate;
  const latencies = filtered.map((report) => report.latencyMs).sort((a, b) => a - b);
  const blockNumbers = filtered
    .map((report) => report.blockNumber)
    .filter((blockNumber): blockNumber is number => blockNumber !== undefined)
    .sort((a, b) => a - b);

  const hasQuorum =
    filtered.length >= policy.minimumValidReports &&
    monitorIds.size >= policy.minimumDistinctMonitors;

  return {
    endpointId: first.endpointId,
    checkType: first.checkType,
    windowStart: first.measurementWindow,
    windowEnd: first.measurementWindow + policy.windowSeconds,
    monitorCount: monitorIds.size,
    validReportCount: filtered.length,
    successRate,
    errorRate,
    medianLatencyMs: percentile(latencies, 50),
    p50LatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    p99LatencyMs: percentile(latencies, 99),
    medianBlockNumber: percentile(blockNumbers, 50),
    medianBlockDelay: undefined,
    status: classifyStatus(hasQuorum, successRate),
    excludedReportCount: group.length - filtered.length,
    metadata: {
      sourceReportCount: group.length,
      outlierMethod: "median_absolute_deviation",
    },
  };
}

function normalizeWindow(value: number, windowSeconds: number): number {
  return Math.floor(value / windowSeconds) * windowSeconds;
}

function filterLatencyOutliers(
  reports: AcceptedReport[],
  fixedThresholdMs: number
): AcceptedReport[] {
  if (reports.length < 4) {
    return reports;
  }

  const latencies = reports.map((report) => report.latencyMs).sort((a, b) => a - b);
  const medianLatency = percentile(latencies, 50);
  if (medianLatency === undefined) {
    return reports;
  }

  const deviations = latencies
    .map((latency) => Math.abs(latency - medianLatency))
    .sort((a, b) => a - b);
  const mad = percentile(deviations, 50) ?? 0;
  const threshold = Math.max(3 * mad, fixedThresholdMs);

  return reports.filter((report) => Math.abs(report.latencyMs - medianLatency) <= threshold);
}

function percentile(sortedValues: number[], percentileRank: number): number | undefined {
  if (sortedValues.length === 0) {
    return undefined;
  }
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }

  const index = (percentileRank / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  const lowerValue = sortedValues[lower] ?? 0;
  const upperValue = sortedValues[upper] ?? lowerValue;

  return lowerValue + (upperValue - lowerValue) * weight;
}

function classifyStatus(
  hasQuorum: boolean,
  successRate: number
): "healthy" | "degraded" | "down" | "inconclusive" {
  if (!hasQuorum) {
    return "inconclusive";
  }
  if (successRate >= 0.999) {
    return "healthy";
  }
  if (successRate > 0) {
    return "degraded";
  }
  return "down";
}
