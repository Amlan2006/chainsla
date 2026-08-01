import assert from "node:assert/strict";
import test from "node:test";

import { buildMerkleTree, getMerkleProof, reportLeaf, verifyMerkleProof } from "./index.js";

test("builds and verifies report Merkle proofs", () => {
  const leaves = [
    reportLeaf({
      reportId: "report-1",
      monitorAddress: "0x0000000000000000000000000000000000000001",
      endpointId: "endpoint-1",
      payloadHash: "0x1000000000000000000000000000000000000000000000000000000000000000",
      measurementWindow: 100,
    }),
    reportLeaf({
      reportId: "report-2",
      monitorAddress: "0x0000000000000000000000000000000000000002",
      endpointId: "endpoint-1",
      payloadHash: "0x2000000000000000000000000000000000000000000000000000000000000000",
      measurementWindow: 100,
    }),
    reportLeaf({
      reportId: "report-3",
      monitorAddress: "0x0000000000000000000000000000000000000003",
      endpointId: "endpoint-2",
      payloadHash: "0x3000000000000000000000000000000000000000000000000000000000000000",
      measurementWindow: 100,
    }),
  ];

  const tree = buildMerkleTree(leaves);
  const proof = getMerkleProof(tree, leaves[1]!);

  assert.equal(verifyMerkleProof(leaves[1]!, proof, tree.root), true);
});
