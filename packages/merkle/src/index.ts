import { concatHex, encodeAbiParameters, keccak256, stringToHex } from "viem";

export type Hex32 = `0x${string}`;
export type Address = `0x${string}`;

export interface ReportLeafInput {
  reportId: string;
  monitorAddress?: Address;
  endpointId: string;
  payloadHash: Hex32;
  measurementWindow: number | bigint;
}

export interface MerkleTree {
  leaves: Hex32[];
  levels: Hex32[][];
  root: Hex32;
}

const zeroAddress = "0x0000000000000000000000000000000000000000" as const;
const zeroRoot = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export function pairHash(left: Hex32, right: Hex32): Hex32 {
  const [a, b] = left.toLowerCase() <= right.toLowerCase() ? [left, right] : [right, left];
  return keccak256(concatHex([a, b]));
}

export function emptyRoot(): Hex32 {
  return zeroRoot;
}

export function reportLeaf(input: ReportLeafInput): Hex32 {
  return keccak256(
    encodeAbiParameters(
      [
        { name: "reportIdHash", type: "bytes32" },
        { name: "monitorAddress", type: "address" },
        { name: "endpointIdHash", type: "bytes32" },
        { name: "payloadHash", type: "bytes32" },
        { name: "measurementWindow", type: "uint256" },
      ],
      [
        keccak256(stringToHex(input.reportId)),
        input.monitorAddress ?? zeroAddress,
        keccak256(stringToHex(input.endpointId)),
        input.payloadHash,
        BigInt(input.measurementWindow),
      ]
    )
  );
}

export function buildMerkleTree(inputLeaves: Hex32[]): MerkleTree {
  const leaves = [...inputLeaves].sort(compareHex);
  if (leaves.length === 0) {
    return { leaves, levels: [[]], root: zeroRoot };
  }

  const levels: Hex32[][] = [leaves];
  let current = leaves;

  while (current.length > 1) {
    const next: Hex32[] = [];
    for (let index = 0; index < current.length; index += 2) {
      const left = current[index];
      if (!left) {
        continue;
      }
      const right = current[index + 1] ?? left;
      next.push(pairHash(left, right));
    }
    levels.push(next);
    current = next;
  }

  return {
    leaves,
    levels,
    root: current[0] ?? zeroRoot,
  };
}

export function getMerkleProof(tree: MerkleTree, leaf: Hex32): Hex32[] {
  let index = tree.leaves.findIndex((candidate) => candidate.toLowerCase() === leaf.toLowerCase());
  if (index === -1) {
    throw new Error("leaf not found in tree");
  }

  const proof: Hex32[] = [];
  for (const level of tree.levels.slice(0, -1)) {
    const pairIndex = index % 2 === 0 ? index + 1 : index - 1;
    proof.push(level[pairIndex] ?? level[index] ?? zeroRoot);
    index = Math.floor(index / 2);
  }

  return proof;
}

export function verifyMerkleProof(leaf: Hex32, proof: Hex32[], root: Hex32): boolean {
  const computed = proof.reduce((hash, sibling) => pairHash(hash, sibling), leaf);
  return computed.toLowerCase() === root.toLowerCase();
}

function compareHex(left: Hex32, right: Hex32): number {
  return left.toLowerCase().localeCompare(right.toLowerCase());
}
