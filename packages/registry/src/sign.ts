/**
 * Ed25519 sign/verify for anchor attestations.
 */

import nacl from "tweetnacl";
import bs58 from "bs58";
import { stableCanonicalize } from "./canonical.js";
import type { AnchorAttestation } from "./types.js";

export function signPayload(payloadCanonical: string, secretKeyB58: string): string {
  const secretKey = bs58.decode(secretKeyB58);
  const keypair = nacl.sign.keyPair.fromSecretKey(secretKey);
  const msg = new TextEncoder().encode(payloadCanonical);
  const sig = nacl.sign.detached(msg, keypair.secretKey);
  return bs58.encode(Buffer.from(sig));
}

export function verifySignature(attestation: AnchorAttestation): boolean {
  try {
    const { signature_b58, ...payload } = attestation;
    if (payload.scheme !== "ed25519") return false;
    const payloadCanonical = stableCanonicalize(payload);
    const pubBytes = bs58.decode(payload.issuer_public_key_b58);
    const sigBytes = bs58.decode(signature_b58);
    const msg = new TextEncoder().encode(payloadCanonical);
    return nacl.sign.detached.verify(msg, sigBytes, pubBytes);
  } catch {
    return false;
  }
}

/** Payload to sign: full attestation without signature_b58 (includes anchor_id). */
export function payloadToSign(att: Omit<AnchorAttestation, "signature_b58">): string {
  return stableCanonicalize(att);
}
