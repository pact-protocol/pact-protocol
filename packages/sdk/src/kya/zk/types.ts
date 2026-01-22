/**
 * ZK-KYA (Zero-Knowledge Know Your Agent) Types (v2 Phase 5)
 * 
 * Types for zero-knowledge proof-based identity verification.
 * This module provides the interface for ZK-KYA proofs without implementing
 * actual zero-knowledge cryptography.
 */

/**
 * ZK-KYA Proof
 * 
 * Represents a zero-knowledge proof of agent identity/credentials.
 * Only hashes are stored in transcripts; raw proof bytes are never logged.
 */
export interface ZkKyaProof {
  /** Proof scheme (e.g., "groth16", "plonk", "halo2") */
  scheme: "groth16" | "plonk" | "halo2" | "unknown";
  
  /** Circuit identifier (e.g., "kyc_v1", "reputation_v2") */
  circuit_id: string;
  
  /** Optional issuer/attestor identifier */
  issuer_id?: string;
  
  /** SHA-256 hash (hex) of canonicalized public inputs */
  public_inputs_hash: string;
  
  /** SHA-256 hash (hex) of proof bytes */
  proof_hash: string;
  
  /** Optional issuance timestamp (milliseconds since epoch) */
  issued_at_ms?: number;
  
  /** Optional expiration timestamp (milliseconds since epoch) */
  expires_at_ms?: number;
  
  /** Optional non-sensitive metadata */
  meta?: Record<string, unknown>;
}

/**
 * ZK-KYA Verification Result
 * 
 * Result of verifying a ZK-KYA proof.
 */
export interface ZkKyaVerificationResult {
  /** Whether verification succeeded */
  ok: boolean;
  
  /** Failure reason if ok is false */
  reason?: string;
  
  /** Trust tier assigned by verifier */
  tier?: "untrusted" | "low" | "trusted";
  
  /** Trust score (0.0 to 1.0) */
  trust_score?: number;
}

/**
 * ZK-KYA Input (for acquire)
 * 
 * Input format for ZK-KYA proof in acquire().
 * Raw proof bytes are accepted but immediately hashed.
 */
export interface ZkKyaInput {
  /** Proof scheme */
  scheme: "groth16" | "plonk" | "halo2" | "unknown";
  
  /** Circuit identifier */
  circuit_id: string;
  
  /** Optional issuer identifier */
  issuer_id?: string;
  
  /** Public inputs (will be canonicalized and hashed) */
  public_inputs?: Record<string, unknown>;
  
  /** Raw proof bytes (base64 encoded, will be hashed) */
  proof_bytes_b64?: string;
  
  /** Optional issuance timestamp */
  issued_at_ms?: number;
  
  /** Optional expiration timestamp */
  expires_at_ms?: number;
  
  /** Optional metadata */
  meta?: Record<string, unknown>;
}
