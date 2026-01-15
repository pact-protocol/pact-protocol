/**
 * ZK-KYA Verifier Interface (v2 Phase 5)
 * 
 * Pluggable verifier interface for ZK-KYA proofs.
 * Default implementation returns "not implemented" for deterministic CI.
 */

import type { ZkKyaProof, ZkKyaVerificationResult } from "./types";

/**
 * ZK-KYA Verifier Interface
 * 
 * Pluggable interface for verifying ZK-KYA proofs.
 * Implementations can be swapped for testing or production use.
 */
export interface ZkKyaVerifier {
  /**
   * Verify a ZK-KYA proof.
   * 
   * @param input Verification input
   * @returns Verification result
   */
  verify(input: {
    agent_id: string;
    proof: ZkKyaProof;
    now_ms: number;
  }): Promise<ZkKyaVerificationResult>;
}

/**
 * Default ZK-KYA Verifier
 * 
 * Stub implementation that returns "not implemented".
 * Used by default in acquire() unless overridden.
 * 
 * This ensures deterministic behavior in CI without actual ZK crypto.
 */
export class DefaultZkKyaVerifier implements ZkKyaVerifier {
  async verify(_input: {
    agent_id: string;
    proof: ZkKyaProof;
    now_ms: number;
  }): Promise<ZkKyaVerificationResult> {
    return {
      ok: false,
      reason: "ZK_KYA_NOT_IMPLEMENTED",
    };
  }
}

/**
 * Test ZK-KYA Verifier Factory
 * 
 * Creates a test verifier that returns deterministic results.
 * Useful for unit tests.
 * 
 * @param config Test verifier configuration
 * @returns Test ZK-KYA verifier
 */
export function createTestZkKyaVerifier(config: {
  /** Whether to return ok: true */
  shouldPass?: boolean;
  /** Trust tier to return if passing */
  tier?: "untrusted" | "low" | "trusted";
  /** Trust score to return if passing */
  trustScore?: number;
  /** Failure reason if not passing */
  failureReason?: string;
}): ZkKyaVerifier {
  const {
    shouldPass = true,
    tier = "trusted",
    trustScore = 0.9,
    failureReason = "ZK_KYA_TEST_FAILURE",
  } = config;
  
  return {
    async verify(_input: {
      agent_id: string;
      proof: ZkKyaProof;
      now_ms: number;
    }): Promise<ZkKyaVerificationResult> {
      if (shouldPass) {
        return {
          ok: true,
          tier,
          trust_score: trustScore,
        };
      } else {
        return {
          ok: false,
          reason: failureReason,
        };
      }
    },
  };
}
