/**
 * Offline verification of anchor attestations: schema, signature, expiry, trusted issuer.
 */

import { createHash } from "node:crypto";
import { stableCanonicalize } from "./canonical.js";
import { verifySignature } from "./sign.js";
import type { AnchorAttestation, TrustedIssuer } from "./types.js";

export interface VerifyResult {
  ok: boolean;
  error?: string;
  expired?: boolean;
  revoked?: boolean;
  issuerTrusted?: boolean;
}

/**
 * Compute expected anchor_id from attestation.
 * Must match issue(): hash is over payload without anchor_id and signature_b58,
 * and with revocation_ref set to null (issue() hashes before setting revocation_ref).
 */
export function computeExpectedAnchorId(att: AnchorAttestation): string {
  const { signature_b58, anchor_id, ...rest } = att;
  const payloadWithoutId = { ...rest, revocation_ref: null };
  const canonical = stableCanonicalize(payloadWithoutId);
  const hash = createHash("sha256").update(canonical, "utf8").digest("hex");
  return "anchor-" + hash;
}

/**
 * Verify attestation structure and anchor_id.
 */
export function verifyAnchorId(att: AnchorAttestation): boolean {
  const expected = computeExpectedAnchorId(att);
  return att.anchor_id === expected;
}

/**
 * Verify attestation: schema (required fields), anchor_id, signature, expiry, trusted issuer.
 * Offline-only; does not check revocation.
 */
export function verifyAttestationOffline(
  att: AnchorAttestation,
  trustedIssuers: TrustedIssuer[]
): VerifyResult {
  if (
    !att.anchor_id ||
    !att.subject_signer_public_key_b58 ||
    !att.anchor_type ||
    !att.issuer_public_key_b58 ||
    typeof att.issued_at_ms !== "number" ||
    !att.payload ||
    typeof att.payload !== "object" ||
    !att.signature_b58 ||
    att.scheme !== "ed25519"
  ) {
    return { ok: false, error: "Missing or invalid required fields" };
  }
  if (!verifyAnchorId(att)) {
    return { ok: false, error: "anchor_id mismatch" };
  }
  if (!verifySignature(att)) {
    return { ok: false, error: "Invalid signature" };
  }
  const now = Date.now();
  if (att.expires_at_ms != null && att.expires_at_ms < now) {
    return { ok: false, expired: true, error: "Attestation expired" };
  }
  const trusted = trustedIssuers.some((i) => i.issuer_public_key_b58 === att.issuer_public_key_b58);
  if (!trusted) {
    return { ok: false, issuerTrusted: false, error: "Issuer not in trusted set" };
  }
  return { ok: true, issuerTrusted: true };
}
