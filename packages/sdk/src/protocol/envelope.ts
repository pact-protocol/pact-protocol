// packages/sdk/src/protocol/envelope.ts
import nacl from "tweetnacl";
import bs58 from "bs58";
import { createHash } from "node:crypto";
import { stableCanonicalize } from "./canonical";
import type { ParsedPactMessage } from "./schemas";

export type Keypair = {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
};

export type SignedEnvelope<T = ParsedPactMessage> = {
  envelope_version: "pact-envelope/1.0";
  message: T;
  message_hash_hex: string;
  signer_public_key_b58: string;
  signature_b58: string;
  signed_at_ms: number;
};

export function generateKeypair(): Keypair {
  return nacl.sign.keyPair();
}

// Back-compat alias (some code calls generateKeyPair)
export const generateKeyPair = generateKeypair;

function toUtf8Bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function sha256Hex(input: Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Hashes the message ONLY (not the envelope), using stable canonical JSON.
 */
export function hashMessage(message: unknown): { hashBytes: Uint8Array; hashHex: string } {
  const canon = stableCanonicalize(message);
  const bytes = toUtf8Bytes(canon);
  const hex = sha256Hex(bytes);
  return { hashBytes: new Uint8Array(Buffer.from(hex, "hex")), hashHex: hex };
}

/**
 * Signs the message hash with Ed25519 (tweetnacl).
 */
export async function signEnvelope<T = ParsedPactMessage>(
  message: T,
  keypair: Keypair,
  signedAtMs: number = Date.now()
): Promise<SignedEnvelope<T>> {
  const { hashBytes, hashHex } = hashMessage(message);

  const sigBytes = nacl.sign.detached(hashBytes, keypair.secretKey);

  return {
    envelope_version: "pact-envelope/1.0",
    message,
    message_hash_hex: hashHex,
    signer_public_key_b58: bs58.encode(Buffer.from(keypair.publicKey)),
    signature_b58: bs58.encode(Buffer.from(sigBytes)),
    signed_at_ms: signedAtMs,
  };
}

/**
 * Verifies:
 * 1) envelope shape
 * 2) message_hash_hex matches recomputed hash(message)
 * 3) signature verifies over the hash bytes using signer_public_key_b58
 */
export function verifyEnvelope(envelope: any): boolean {
  try {
    if (!envelope || envelope.envelope_version !== "pact-envelope/1.0") return false;
    if (!envelope.message) return false;

    const msgHashHex = envelope.message_hash_hex;
    if (typeof msgHashHex !== "string" || msgHashHex.length !== 64) return false;

    // Recompute hash from message ONLY
    const { hashBytes, hashHex } = hashMessage(envelope.message);
    if (hashHex !== msgHashHex.toLowerCase()) return false;

    const pubB58 = envelope.signer_public_key_b58;
    const sigB58 = envelope.signature_b58;
    if (typeof pubB58 !== "string" || typeof sigB58 !== "string") return false;

    const pubBytes = bs58.decode(pubB58);
    const sigBytes = bs58.decode(sigB58);

    return nacl.sign.detached.verify(hashBytes, sigBytes, pubBytes);
  } catch {
    return false;
  }
}

/**
 * Parse and validate an envelope from unknown input.
 */
export async function parseEnvelope(input: unknown): Promise<SignedEnvelope> {
  // Basic shape validation
  if (typeof input !== "object" || input === null) {
    throw new Error("Envelope must be an object");
  }

  const env = input as Record<string, unknown>;

  if (env.envelope_version !== "pact-envelope/1.0") {
    throw new Error(`Invalid envelope_version: ${env.envelope_version}`);
  }

  if (!env.message) {
    throw new Error("Envelope missing message field");
  }

  // Validate envelope structure
  if (typeof env.message_hash_hex !== "string") {
    throw new Error("message_hash_hex must be a string");
  }

  if (typeof env.signer_public_key_b58 !== "string") {
    throw new Error("signer_public_key_b58 must be a string");
  }

  if (typeof env.signature_b58 !== "string") {
    throw new Error("signature_b58 must be a string");
  }

  if (typeof env.signed_at_ms !== "number") {
    throw new Error("signed_at_ms must be a number");
  }

  return {
    envelope_version: "pact-envelope/1.0",
    message: env.message as ParsedPactMessage,
    message_hash_hex: env.message_hash_hex,
    signer_public_key_b58: env.signer_public_key_b58,
    signature_b58: env.signature_b58,
    signed_at_ms: env.signed_at_ms,
  };
}
