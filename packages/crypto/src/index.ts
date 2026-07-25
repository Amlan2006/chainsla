import { keccak256, stringToHex } from "viem";

export function hashUtf8(value: string): `0x${string}` {
  return keccak256(stringToHex(value));
}
