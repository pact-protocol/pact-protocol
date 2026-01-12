/**
 * Dispute Decision Types and Functions (C3)
 * 
 * Types and functions for signed dispute resolution artifacts.
 */

import nacl from "tweetnacl";
import bs58 from "bs58";
import { stableCanonicalize } from "../protocol/canonical";
import { hashMessageSync } from "../protocol/canonical";
import type { DisputeOutcome } from "./types";

/**
 * Dispute decision object (deterministic content).
 */
export interface DisputeDecision {
  decision_id: string;
  dispute_id: string;
  receipt_id: string;
  intent_id: string;
  buyer_agent_id: string;
  seller_agent_id: string;
  outcome: DisputeOutcome;
  refund_amount: number;
  issued_at_ms: number;
  notes?: string;
  policy_snapshot?: {
    max_refund_pct?: number;
    allow_partial?: boolean;
  };
}

/**
 * Signed dispute decision with arbiter signature.
 */
export interface SignedDecision {
  decision: DisputeDecision;
  arbiter_pubkey_b58: string;
  decision_hash_hex: string;
  signature_b58: string;
}

/**
 * Arbiter keypair type (Ed25519).
 */
export interface ArbiterKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

/**
 * Compute SHA-256 hash of canonical JSON representation of decision.
 * Returns hex string.
 */
export function hashDecision(decision: DisputeDecision): string {
  const hashBytes = hashMessageSync(decision);
  // Convert to hex string
  return Array.from(hashBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Sign a dispute decision with an arbiter Ed25519 keypair.
 * Returns a signed decision with hash and signature.
 */
export function signDecision(
  decision: DisputeDecision,
  arbiterKeyPair: ArbiterKeyPair
): SignedDecision {
  // Compute decision hash
  const decisionHashHex = hashDecision(decision);
  const hashBytes = new Uint8Array(
    Buffer.from(decisionHashHex, "hex")
  );

  // Sign the hash
  const signatureBytes = nacl.sign.detached(
    hashBytes,
    arbiterKeyPair.secretKey
  );

  // Encode public key and signature to base58
  const arbiterPubkeyB58 = bs58.encode(
    Buffer.from(arbiterKeyPair.publicKey)
  );
  const signatureB58 = bs58.encode(Buffer.from(signatureBytes));

  return {
    decision,
    arbiter_pubkey_b58: arbiterPubkeyB58,
    decision_hash_hex: decisionHashHex,
    signature_b58: signatureB58,
  };
}

/**
 * Verify a signed dispute decision.
 * Returns true if:
 * 1. decision_hash_hex matches recomputed hash(decision)
 * 2. signature verifies over the hash bytes using arbiter_pubkey_b58
 */
export function verifyDecision(signedDecision: SignedDecision): boolean {
  try {
    // Recompute hash from decision
    const recomputedHashHex = hashDecision(signedDecision.decision);
    if (
      recomputedHashHex.toLowerCase() !==
      signedDecision.decision_hash_hex.toLowerCase()
    ) {
      return false;
    }

    // Decode public key and signature
    const pubBytes = bs58.decode(signedDecision.arbiter_pubkey_b58);
    const sigBytes = bs58.decode(signedDecision.signature_b58);
    const hashBytes = new Uint8Array(
      Buffer.from(signedDecision.decision_hash_hex, "hex")
    );

    // Verify signature
    return nacl.sign.detached.verify(hashBytes, sigBytes, pubBytes);
  } catch {
    return false;
  }
}

