import assert from "node:assert/strict";
import test from "node:test";

import { aggregateReports } from "./aggregation.js";

test("aggregates report latency percentiles and success rate", () => {
  const aggregates = aggregateReports(
    [
      report("monitor-a", 100, true),
      report("monitor-b", 200, true),
      report("monitor-c", 300, false),
    ],
    {
      minimumDistinctMonitors: 2,
      minimumValidReports: 2,
      windowSeconds: 60,
      latencyOutlierFixedThresholdMs: 1_000,
    }
  );

  assert.equal(aggregates.length, 1);
  assert.equal(aggregates[0]?.monitorCount, 3);
  assert.equal(aggregates[0]?.validReportCount, 3);
  assert.equal(aggregates[0]?.successRate, 2 / 3);
  assert.ok(Math.abs((aggregates[0]?.errorRate ?? 0) - 1 / 3) < 0.000001);
  assert.equal(aggregates[0]?.p50LatencyMs, 200);
  assert.equal(aggregates[0]?.status, "degraded");
});

test("marks windows inconclusive when quorum is missing", () => {
  const aggregates = aggregateReports([report("monitor-a", 100, true)], {
    minimumDistinctMonitors: 2,
    minimumValidReports: 2,
    windowSeconds: 60,
    latencyOutlierFixedThresholdMs: 1_000,
  });

  assert.equal(aggregates[0]?.status, "inconclusive");
});

test("excludes large latency outliers", () => {
  const aggregates = aggregateReports(
    [
      report("monitor-a", 100, true),
      report("monitor-b", 110, true),
      report("monitor-c", 120, true),
      report("monitor-d", 20_000, true),
    ],
    {
      minimumDistinctMonitors: 2,
      minimumValidReports: 2,
      windowSeconds: 60,
      latencyOutlierFixedThresholdMs: 1_000,
    }
  );

  assert.equal(aggregates[0]?.validReportCount, 3);
  assert.equal(aggregates[0]?.excludedReportCount, 1);
});

function report(monitorId: string, latencyMs: number, success: boolean) {
  return {
    reportId: `${monitorId}-${latencyMs}`,
    monitorId,
    endpointId: "endpoint-local-1",
    checkType: "ETH_BLOCK_NUMBER",
    measurementWindow: 1_785_000_000,
    latencyMs,
    success,
    blockNumber: 100,
  };
}
