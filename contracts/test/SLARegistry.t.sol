// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../src/SLARegistry.sol";

contract SLARegistryTest {
    function testRegisterAndPublishEvaluation() public {
        SLARegistry registry = new SLARegistry();
        bytes32 slaId = keccak256("sla-1");
        bytes32 evaluationId = keccak256("evaluation-1");
        bytes32 leaf = keccak256("evidence");

        registry.registerSla(slaId, address(1), address(2), keccak256("endpoint"), 100, 200, keccak256("terms"));
        registry.publishEvaluation(evaluationId, slaId, leaf, 1);

        (bytes32 storedSlaId, bytes32 root, uint8 outcome,,,) = registry.evaluations(evaluationId);
        require(storedSlaId == slaId, "SLA mismatch");
        require(root == leaf, "root mismatch");
        require(outcome == 1, "outcome mismatch");
    }

    function testDuplicateEvaluationReverts() public {
        SLARegistry registry = new SLARegistry();
        bytes32 slaId = keccak256("sla-1");
        bytes32 evaluationId = keccak256("evaluation-1");
        registry.registerSla(slaId, address(1), address(2), keccak256("endpoint"), 100, 200, keccak256("terms"));
        registry.publishEvaluation(evaluationId, slaId, keccak256("root"), 2);

        try registry.publishEvaluation(evaluationId, slaId, keccak256("root-2"), 2) {
            revert("expected duplicate revert");
        } catch (bytes memory) {}
    }

    function testVerifyEvidenceProof() public {
        SLARegistry registry = new SLARegistry();
        bytes32 slaId = keccak256("sla-1");
        bytes32 evaluationId = keccak256("evaluation-1");
        bytes32 left = keccak256("left");
        bytes32 right = keccak256("right");
        bytes32 root =
            left <= right ? keccak256(abi.encodePacked(left, right)) : keccak256(abi.encodePacked(right, left));
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = right;

        registry.registerSla(slaId, address(1), address(2), keccak256("endpoint"), 100, 200, keccak256("terms"));
        registry.publishEvaluation(evaluationId, slaId, root, 3);
        require(registry.verifyEvidence(evaluationId, left, proof), "evidence should verify");
    }
}
