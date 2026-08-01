import pino from "pino";
import { Store } from "@rpc-sla/database";
import { buildMerkleTree, reportLeaf } from "@rpc-sla/merkle";
import { evaluateSla } from "@rpc-sla/sla";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  keccak256,
  stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { aggregateReports } from "./aggregation.js";
import { loadWorkerConfig } from "./config.js";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
const config = loadWorkerConfig();
const store = new Store({ databaseUrl: config.databaseUrl });

let shuttingDown = false;

const reportCommitmentAbi = [
  {
    type: "function",
    name: "publishBatch",
    inputs: [
      { name: "batchId", type: "bytes32" },
      { name: "merkleRoot", type: "bytes32" },
      { name: "startTime", type: "uint64" },
      { name: "endTime", type: "uint64" },
      { name: "reportCount", type: "uint32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

const slaRegistryAbi = [
  {
    type: "function",
    name: "registerSla",
    inputs: [
      { name: "slaId", type: "bytes32" },
      { name: "provider", type: "address" },
      { name: "customer", type: "address" },
      { name: "endpointIdHash", type: "bytes32" },
      { name: "periodStart", type: "uint64" },
      { name: "periodEnd", type: "uint64" },
      { name: "termsHash", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "publishEvaluation",
    inputs: [
      { name: "evaluationId", type: "bytes32" },
      { name: "slaId", type: "bytes32" },
      { name: "evidenceRoot", type: "bytes32" },
      { name: "outcome", type: "uint8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

async function runAggregationOnce(): Promise<void> {
  if (!config.databaseUrl) {
    logger.warn("DATABASE_URL is not set; aggregation is disabled");
    return;
  }

  const since = new Date(Date.now() - config.aggregationLookbackMinutes * 60_000);
  const reports = await store.acceptedReportsSince(since);
  const aggregates = aggregateReports(reports, {
    minimumValidReports: config.minimumValidReports,
    minimumDistinctMonitors: config.minimumDistinctMonitors,
    windowSeconds: config.aggregationWindowSeconds,
    latencyOutlierFixedThresholdMs: config.latencyOutlierFixedThresholdMs,
  });

  for (const aggregate of aggregates) {
    await store.upsertAggregateWindow(aggregate);
  }

  logger.info(
    {
      reports: reports.length,
      aggregates: aggregates.length,
      lookbackMinutes: config.aggregationLookbackMinutes,
    },
    "aggregation pass completed"
  );
}

async function runCommitmentOnce(): Promise<void> {
  if (!config.databaseUrl) {
    return;
  }

  const reports = await store.uncommittedAcceptedReports(config.commitmentBatchSize);
  if (reports.length === 0) {
    logger.info("commitment pass skipped; no uncommitted reports");
    return;
  }

  const reportLeaves = reports.map((report) => ({
    reportId: report.reportId,
    leafHash: reportLeaf({
      reportId: report.reportId,
      monitorAddress: report.monitorAddress,
      endpointId: report.endpointId,
      payloadHash: report.payloadHash,
      measurementWindow: report.measurementWindow,
    }),
  }));
  const tree = buildMerkleTree(reportLeaves.map((report) => report.leafHash));
  const startWindow = Math.min(...reports.map((report) => report.measurementWindow));
  const endWindow = Math.max(...reports.map((report) => report.measurementWindow));
  const batchId = keccak256(
    stringToHex(`${tree.root}:${reports.length}:${startWindow}:${endWindow}`)
  );

  await store.createReportBatch({
    batchId,
    merkleRoot: tree.root,
    startWindow,
    endWindow,
    reportCount: reports.length,
    reports: reportLeaves.map((report) => ({
      reportId: report.reportId,
      leafHash: report.leafHash,
      leafIndex: tree.leaves.findIndex(
        (leaf) => leaf.toLowerCase() === report.leafHash.toLowerCase()
      ),
    })),
  });

  const txHash = await publishBatchIfConfigured({
    batchId,
    merkleRoot: tree.root,
    startWindow,
    endWindow,
    reportCount: reports.length,
  });
  if (txHash) {
    await store.markReportBatchPublished(batchId, txHash);
  }

  logger.info(
    {
      batchId,
      merkleRoot: tree.root,
      reports: reports.length,
      txHash,
    },
    "report commitment batch built"
  );
}

async function runSlaEvaluationOnce(): Promise<void> {
  if (!config.databaseUrl) return;

  const pending = await store.pendingSlas(config.slaEvaluationBatchSize);
  for (const sla of pending) {
    const aggregates = await store.slaAggregateEvidence(sla);
    const result = evaluateSla(sla, aggregates);
    const evaluationId = keccak256(stringToHex(`${sla.id}:${result.evidenceRoot}`));
    await store.saveSlaEvaluation({
      evaluationId,
      slaId: sla.id,
      outcome: result.status,
      evidenceRoot: result.evidenceRoot,
      aggregateCount: result.evidence.length,
      metrics: { ...result.metrics },
      reasons: result.reasons,
      evidence: result.evidence,
    });
    logger.info(
      { slaId: sla.id, evaluationId, outcome: result.status, reasons: result.reasons },
      "SLA evaluation completed"
    );
  }

  const unpublished = await store.unpublishedSlaEvaluations(config.slaEvaluationBatchSize);
  for (const sla of unpublished) {
    if (!sla.evaluation) continue;
    const published = await publishSlaEvaluationIfConfigured(sla);
    if (!published) continue;
    await store.markSlaEvaluationPublished(sla.evaluation.evaluationId, published.evaluationTxHash);
    logger.info(
      { slaId: sla.id, evaluationId: sla.evaluation.evaluationId, ...published },
      "SLA evaluation published"
    );
  }
}

async function publishSlaEvaluationIfConfigured(sla: Awaited<ReturnType<typeof store.sla>>) {
  if (
    !sla?.evaluation ||
    !config.slaRegistryContract ||
    !config.publisherPrivateKey ||
    !config.chainRpcUrl ||
    !sla.providerAddress ||
    !sla.customerAddress
  ) {
    return undefined;
  }

  const account = privateKeyToAccount(config.publisherPrivateKey as `0x${string}`);
  const chain = configuredChain();
  const wallet = createWalletClient({ account, chain, transport: http(config.chainRpcUrl) });
  const publicClient = createPublicClient({ chain, transport: http(config.chainRpcUrl) });
  let registrationTxHash: `0x${string}` | undefined;

  if (!sla.registrationTxHash) {
    registrationTxHash = await wallet.writeContract({
      address: config.slaRegistryContract as `0x${string}`,
      chain,
      abi: slaRegistryAbi,
      functionName: "registerSla",
      args: [
        keccak256(stringToHex(sla.id)),
        sla.providerAddress as `0x${string}`,
        sla.customerAddress as `0x${string}`,
        keccak256(stringToHex(sla.endpointId)),
        BigInt(sla.periodStart),
        BigInt(sla.periodEnd),
        sla.termsHash,
      ],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: registrationTxHash });
    if (receipt.status !== "success") throw new Error("SLA registration transaction reverted");
    await store.markSlaRegistered(sla.id, registrationTxHash);
  }

  const evaluationTxHash = await wallet.writeContract({
    address: config.slaRegistryContract as `0x${string}`,
    chain,
    abi: slaRegistryAbi,
    functionName: "publishEvaluation",
    args: [
      sla.evaluation.evaluationId as `0x${string}`,
      keccak256(stringToHex(sla.id)),
      sla.evaluation.evidenceRoot,
      outcomeCode(sla.evaluation.outcome),
    ],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: evaluationTxHash });
  if (receipt.status !== "success") throw new Error("SLA evaluation transaction reverted");
  return { registrationTxHash, evaluationTxHash };
}

function configuredChain() {
  return defineChain({
    id: config.chainId,
    name: "Configured EVM",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [config.chainRpcUrl!] } },
  });
}

function outcomeCode(outcome: string): number {
  if (outcome === "passed") return 1;
  if (outcome === "violated") return 2;
  return 3;
}

async function publishBatchIfConfigured(input: {
  batchId: `0x${string}`;
  merkleRoot: `0x${string}`;
  startWindow: number;
  endWindow: number;
  reportCount: number;
}): Promise<`0x${string}` | undefined> {
  if (!config.reportCommitmentContract || !config.publisherPrivateKey || !config.chainRpcUrl) {
    return undefined;
  }

  const account = privateKeyToAccount(config.publisherPrivateKey as `0x${string}`);
  const chain = configuredChain();
  const client = createWalletClient({
    account,
    chain,
    transport: http(config.chainRpcUrl),
  });

  return client.writeContract({
    address: config.reportCommitmentContract as `0x${string}`,
    chain,
    abi: reportCommitmentAbi,
    functionName: "publishBatch",
    args: [
      input.batchId,
      input.merkleRoot,
      BigInt(input.startWindow),
      BigInt(input.endWindow),
      input.reportCount,
    ],
  });
}

async function main(): Promise<void> {
  logger.info(
    {
      redisUrl: config.redisUrl,
      aggregationIntervalMs: config.aggregationIntervalMs,
      aggregationWindowSeconds: config.aggregationWindowSeconds,
    },
    "worker booted"
  );

  await store.migrate();
  await runAggregationOnce();
  await runCommitmentOnce();
  await runSlaEvaluationOnce();

  const interval = setInterval(() => {
    Promise.all([runAggregationOnce(), runCommitmentOnce(), runSlaEvaluationOnce()]).catch(
      (error: unknown) => {
        logger.error({ error }, "worker pass failed");
      }
    );
  }, config.aggregationIntervalMs);

  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    clearInterval(interval);
    logger.info({ signal }, "worker shutting down");
    await store.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => {
    shutdown("SIGTERM").catch((error: unknown) => {
      logger.error({ error }, "worker shutdown failed");
      process.exit(1);
    });
  });

  process.on("SIGINT", () => {
    shutdown("SIGINT").catch((error: unknown) => {
      logger.error({ error }, "worker shutdown failed");
      process.exit(1);
    });
  });
}

main().catch((error: unknown) => {
  logger.error({ error }, "worker failed");
  process.exit(1);
});
