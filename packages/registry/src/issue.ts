/**
 * Issue a signed anchor attestation.
 * anchor_id = "anchor-" + sha256(canonical(payload_without_signature_and_without_anchor_id)).
 */

import { createHash } from "node:crypto";
import type { AnchorAttestation, IssueRequest } from "./types.js";
import { stableCanonicalize } from "./canonical.js";
import { signPayload, payloadToSign } from "./sign.js";

export function computeAnchorId(payloadCanonical: string): string {
  const hash = createHash("sha256").update(payloadCanonical, "utf8").digest("hex");
  return "anchor-" + hash;
}

export function issue(
  req: IssueRequest,
  issuerPublicKeyB58: string,
  issuerSecretKeyB58: string,
  issuedAtMs: number = Date.now()
): AnchorAttestation {
  const attWithoutIdAndSig: Omit<AnchorAttestation, "anchor_id" | "signature_b58"> = {
    subject_signer_public_key_b58: req.subject_signer_public_key_b58,
    anchor_type: req.anchor_type as AnchorAttestation["anchor_type"],
    issuer_public_key_b58: issuerPublicKeyB58,
    issued_at_ms: issuedAtMs,
    payload: req.payload,
    scheme: "ed25519",
    display_name: req.display_name,
    verification_method: req.verification_method,
    expires_at_ms: req.expires_at_ms ?? null,
    revocation_ref: null,
    evidence_refs: req.evidence_refs ?? null,
  };
  const canonicalForHash = stableCanonicalize(attWithoutIdAndSig);
  const anchor_id = computeAnchorId(canonicalForHash);
  const revocation_ref: string | null = `revocation:${anchor_id}`;
  const withId = { ...attWithoutIdAndSig, anchor_id, revocation_ref };
  const toSign = payloadToSign(withId as Omit<AnchorAttestation, "signature_b58">);
  const signature_b58 = signPayload(toSign, issuerSecretKeyB58);
  return { ...withId, signature_b58 };
}
