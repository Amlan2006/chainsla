import assert from "node:assert/strict";
import test from "node:test";

import { evaluateSla, type SlaAggregateEvidence, type SlaTerms } from "./index.js";

const terms: SlaTerms = {
  id: "sla-1",
  endpointId: "endpoint-1",
  periodStart: 100,
  periodEnd: 300,
  minimumUptime: 0.99,
  maximumP95LatencyMs: 300,
  maximumErrorRate: 0.01,
};

const healthyEvidence: SlaAggregateEvidence[] = [
  {
    endpointId: "endpoint-1",
    checkType: "HTTP_AVAILABILITY",
    windowStart: 100,
    windowEnd: 160,
    validReportCount: 3,
    successRate: 1,
    errorRate: 0,
    p95LatencyMs: 120,
    status: "healthy",
  },
];

test("passes an SLA and produces deterministic evidence", () => {
  const first = evaluateSla(terms, healthyEvidence);
  const second = evaluateSla(terms, [...healthyEvidence].reverse());

  assert.equal(first.status, "passed");
  assert.equal(first.evidenceRoot, second.evidenceRoot);
  assert.equal(first.evidence.length, 1);
});

test("returns explicit violation reasons", () => {
  const result = evaluateSla(terms, [
    { ...healthyEvidence[0]!, successRate: 0.9, errorRate: 0.1, p95LatencyMs: 450 },
  ]);

  assert.equal(result.status, "violated");
  assert.equal(result.reasons.length, 3);
});

test("is inconclusive without availability evidence", () => {
  const result = evaluateSla(terms, [{ ...healthyEvidence[0]!, checkType: "ETH_CHAIN_ID" }]);

  assert.equal(result.status, "inconclusive");
  assert.match(result.reasons[0]!, /availability/u);
});
