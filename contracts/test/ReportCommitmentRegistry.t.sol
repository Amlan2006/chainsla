// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../src/ReportCommitmentRegistry.sol";

contract ReportCommitmentRegistryTest {
    function testPublishBatchUpdatesLatestBatch() public {
        ReportCommitmentRegistry registry = new ReportCommitmentRegistry();
        bytes32 batchId = keccak256("batch-1");
        bytes32 root = keccak256("root-1");

        registry.publishBatch(batchId, root, 100, 200, 3);

        require(registry.latestBatchId() == batchId, "latest batch mismatch");
        (bytes32 storedRoot,,,,,) = registry.batches(batchId);
        require(storedRoot == root, "root mismatch");
    }

    function testDuplicateBatchReverts() public {
        ReportCommitmentRegistry registry = new ReportCommitmentRegistry();
        bytes32 batchId = keccak256("batch-1");

        registry.publishBatch(batchId, keccak256("root-1"), 100, 200, 3);

        try registry.publishBatch(batchId, keccak256("root-2"), 100, 200, 3) {
            revert("expected duplicate revert");
        } catch (bytes memory) {}
    }

    function testVerifyReportProof() public {
        ReportCommitmentRegistry registry = new ReportCommitmentRegistry();
        bytes32 left = keccak256("left");
        bytes32 right = keccak256("right");
        bytes32 root =
            left <= right ? keccak256(abi.encodePacked(left, right)) : keccak256(abi.encodePacked(right, left));
        bytes32 batchId = keccak256("batch-1");
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = right;

        registry.publishBatch(batchId, root, 100, 200, 2);

        require(registry.verifyReport(batchId, left, proof), "proof should verify");
    }
}
