// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title SLARegistry
/// @notice Anchors SLA terms and deterministic evaluation evidence on-chain.
contract SLARegistry {
    struct SLA {
        address provider;
        address customer;
        bytes32 endpointIdHash;
        uint64 periodStart;
        uint64 periodEnd;
        bytes32 termsHash;
        bool exists;
    }

    struct Evaluation {
        bytes32 slaId;
        bytes32 evidenceRoot;
        uint8 outcome;
        address publisher;
        uint64 publishedAt;
        bool exists;
    }

    error NotOwner();
    error NotPublisher();
    error InvalidSLA();
    error SLAAlreadyRegistered();
    error SLAUnknown();
    error InvalidEvaluation();
    error EvaluationAlreadyPublished();

    address public owner;
    mapping(address publisher => bool allowed) public publishers;
    mapping(bytes32 slaId => SLA definition) public slas;
    mapping(bytes32 evaluationId => Evaluation evaluation) public evaluations;

    event PublisherSet(address indexed publisher, bool allowed);
    event SLARegistered(
        bytes32 indexed slaId,
        address indexed provider,
        address indexed customer,
        bytes32 endpointIdHash,
        uint64 periodStart,
        uint64 periodEnd,
        bytes32 termsHash
    );
    event EvaluationPublished(
        bytes32 indexed evaluationId,
        bytes32 indexed slaId,
        bytes32 indexed evidenceRoot,
        uint8 outcome,
        address publisher
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

    function setPublisher(address publisher, bool allowed) external onlyOwner {
        publishers[publisher] = allowed;
        emit PublisherSet(publisher, allowed);
    }

    function registerSla(
        bytes32 slaId,
        address provider,
        address customer,
        bytes32 endpointIdHash,
        uint64 periodStart,
        uint64 periodEnd,
        bytes32 termsHash
    ) external onlyPublisher {
        if (
            slaId == bytes32(0) || provider == address(0) || customer == address(0) || endpointIdHash == bytes32(0)
                || periodEnd <= periodStart || termsHash == bytes32(0)
        ) revert InvalidSLA();
        if (slas[slaId].exists) revert SLAAlreadyRegistered();

        slas[slaId] = SLA({
            provider: provider,
            customer: customer,
            endpointIdHash: endpointIdHash,
            periodStart: periodStart,
            periodEnd: periodEnd,
            termsHash: termsHash,
            exists: true
        });
        emit SLARegistered(slaId, provider, customer, endpointIdHash, periodStart, periodEnd, termsHash);
    }

    /// @param outcome 1 = passed, 2 = violated, 3 = inconclusive.
    function publishEvaluation(bytes32 evaluationId, bytes32 slaId, bytes32 evidenceRoot, uint8 outcome)
        external
        onlyPublisher
    {
        if (!slas[slaId].exists) revert SLAUnknown();
        if (evaluationId == bytes32(0) || evidenceRoot == bytes32(0) || outcome < 1 || outcome > 3) {
            revert InvalidEvaluation();
        }
        if (evaluations[evaluationId].exists) revert EvaluationAlreadyPublished();

        evaluations[evaluationId] = Evaluation({
            slaId: slaId,
            evidenceRoot: evidenceRoot,
            outcome: outcome,
            publisher: msg.sender,
            publishedAt: uint64(block.timestamp),
            exists: true
        });
        emit EvaluationPublished(evaluationId, slaId, evidenceRoot, outcome, msg.sender);
    }

    function verifyEvidence(bytes32 evaluationId, bytes32 leaf, bytes32[] calldata proof) external view returns (bool) {
        Evaluation memory evaluation = evaluations[evaluationId];
        if (!evaluation.exists) return false;

        bytes32 computed = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 sibling = proof[i];
            computed = computed <= sibling
                ? keccak256(abi.encodePacked(computed, sibling))
                : keccak256(abi.encodePacked(sibling, computed));
        }
        return computed == evaluation.evidenceRoot;
    }
}
