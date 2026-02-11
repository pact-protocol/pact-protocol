/**
 * Base58 validation for registry request fields.
 * ONLY subject_signer_public_key_b58 (and optionally issuer/signatures internally) are validated.
 * Payload, evidence_refs, display_name, verification_method are opaque and must never be base58-validated.
 */

import bs58 from "bs58";
import type { IssueRequest } from "./types.js";

/**
 * Validates a single string field as Base58 (e.g. Ed25519 public key).
 * Only call this on body.subject_signer_public_key_b58 — never on payload or evidence_refs.
 * @throws Error with message including "non-base58" if invalid
 */
export function validateBase58Field(value: string, fieldName: string): void {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} is required and must be a non-empty string`);
  }
  try {
    const decoded = bs58.decode(value);
    if (!decoded || decoded.length === 0) {
      throw new Error(`${fieldName} decoded to empty buffer`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("base58")) {
      throw new Error(`Invalid ${fieldName}: non-base58 character (expected Ed25519 public key in Base58)`);
    }
    throw e;
  }
}

/** @deprecated Use validateBase58Field(body.subject_signer_public_key_b58, "subject_signer_public_key_b58") so only the subject key is validated. */
export function assertValidBase58PublicKey(value: string, fieldName: string): void {
  validateBase58Field(value, fieldName);
}

/**
 * Validate only subject_signer_public_key_b58 from an issue request (for tests).
 * Server should use validateBase58Field(body.subject_signer_public_key_b58, "subject_signer_public_key_b58") only.
 */
export function validateIssueRequestBase58(body: IssueRequest): void {
  validateBase58Field(body.subject_signer_public_key_b58, "subject_signer_public_key_b58");
}
