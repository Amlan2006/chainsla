import { keccak256, recoverAddress, stringToHex } from "viem";

import type { ReportEnvelope } from "./schemas.js";

export interface ReportValidationResult {
  accepted: boolean;
  payloadHash: `0x${string}`;
  recoveredAddress?: string;
  rejectionReason?: string;
}

export async function validateReportEnvelope(
  envelope: ReportEnvelope
): Promise<ReportValidationResult> {
  const canonicalPayload = JSON.stringify(envelope.payload);
  const calculatedHash = keccak256(stringToHex(canonicalPayload));

  if (calculatedHash.toLowerCase() !== envelope.payloadHash.toLowerCase()) {
    return {
      accepted: false,
      payloadHash: calculatedHash,
      rejectionReason: "payload_hash_mismatch",
    };
  }

  try {
    const recoveredAddress = await recoverAddress({
      hash: calculatedHash,
      signature: envelope.signature as `0x${string}`,
    });

    return {
      accepted: true,
      payloadHash: calculatedHash,
      recoveredAddress: recoveredAddress.toLowerCase(),
    };
  } catch {
    return {
      accepted: false,
      payloadHash: calculatedHash,
      rejectionReason: "invalid_signature",
    };
  }
}

export function validateReportFreshness(
  now: Date,
  startedAtMs: number,
  maxPastAgeMs: number,
  maxFutureSkewMs: number
): string | undefined {
  const nowMs = now.getTime();

  if (startedAtMs < nowMs - maxPastAgeMs) {
    return "stale_report";
  }

  if (startedAtMs > nowMs + maxFutureSkewMs) {
    return "future_report";
  }

  return undefined;
}
