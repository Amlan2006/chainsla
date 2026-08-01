// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title ReportCommitmentRegistry
/// @notice Stores Merkle roots for accepted monitoring report batches.
contract ReportCommitmentRegistry {
    struct ReportBatch {
        bytes32 merkleRoot;
        uint64 startTime;
        uint64 endTime;
        uint32 reportCount;
        address publisher;
        bool exists;
    }

    error NotOwner();
    error NotPublisher();
    error BatchAlreadyPublished();
    error InvalidBatch();

    address public owner;
    bytes32 public latestBatchId;

    mapping(address publisher => bool allowed) public publishers;
    mapping(bytes32 batchId => ReportBatch batch) public batches;

    event PublisherSet(address indexed publisher, bool allowed);
    event BatchPublished(
        bytes32 indexed batchId,
        bytes32 indexed merkleRoot,
        uint64 startTime,
        uint64 endTime,
        uint32 reportCount,
        address indexed publisher
    );

    constructor() {
        owner = msg.sender;
        publishers[msg.sender] = true;
        emit PublisherSet(msg.sender, true);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyPublisher() {
        if (!publishers[msg.sender]) revert NotPublisher();
        _;
    }

    /// @notice Grants or revokes permission to publish report batches.
    function setPublisher(address publisher, bool allowed) external onlyOwner {
        publishers[publisher] = allowed;
        emit PublisherSet(publisher, allowed);
    }

    /// @notice Publishes one Merkle root for an off-chain report batch.
    function publishBatch(bytes32 batchId, bytes32 merkleRoot, uint64 startTime, uint64 endTime, uint32 reportCount)
        external
        onlyPublisher
    {
        if (batchId == bytes32(0) || merkleRoot == bytes32(0) || reportCount == 0 || endTime < startTime) {
            revert InvalidBatch();
        }
        if (batches[batchId].exists) revert BatchAlreadyPublished();

        batches[batchId] = ReportBatch({
            merkleRoot: merkleRoot,
            startTime: startTime,
            endTime: endTime,
            reportCount: reportCount,
            publisher: msg.sender,
            exists: true
        });
        latestBatchId = batchId;

        emit BatchPublished(batchId, merkleRoot, startTime, endTime, reportCount, msg.sender);
    }

    /// @notice Verifies a leaf against a previously published report batch root.
    function verifyReport(bytes32 batchId, bytes32 leaf, bytes32[] calldata proof) external view returns (bool) {
        ReportBatch memory batch = batches[batchId];
        if (!batch.exists) return false;

        bytes32 computed = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 sibling = proof[i];
            computed = computed <= sibling
                ? keccak256(abi.encodePacked(computed, sibling))
                : keccak256(abi.encodePacked(sibling, computed));
        }

        return computed == batch.merkleRoot;
    }
}
