import { concatHex, keccak256 } from "viem";

export type Hex32 = `0x${string}`;

export function pairHash(left: Hex32, right: Hex32): Hex32 {
  return keccak256(concatHex([left, right]));
}

export function emptyRoot(): Hex32 {
  return "0x0000000000000000000000000000000000000000000000000000000000000000";
}
