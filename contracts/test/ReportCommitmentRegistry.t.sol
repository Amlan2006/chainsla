// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../src/ReportCommitmentRegistry.sol";

contract ReportCommitmentRegistryTest {
    function testPublishBatchUpdatesLatestBatch() public {
        ReportCommitmentRegistry registry = new ReportCommitmentRegistry();
        bytes32 batchId = keccak256("batch-1");

        registry.publishBatch(batchId, keccak256("root-1"));

        require(registry.latestBatchId() == batchId, "latest batch mismatch");
    }
}
