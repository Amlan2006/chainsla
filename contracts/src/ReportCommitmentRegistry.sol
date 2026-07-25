// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title ReportCommitmentRegistry
/// @notice Phase 0 placeholder for report Merkle root commitments.
contract ReportCommitmentRegistry {
    bytes32 public latestBatchId;

    event BatchPublished(bytes32 indexed batchId, bytes32 indexed merkleRoot);

    function publishBatch(bytes32 batchId, bytes32 merkleRoot) external {
        latestBatchId = batchId;
        emit BatchPublished(batchId, merkleRoot);
    }
}
