/**
 * Client-side integrity from pack contents only (no network).
 * Verifies: input/transcript.json hash chain, checksums.sha256 (if present), round signatures.
 */

import bs58 from 'bs58';
import nacl from 'tweetnacl';
import type { IntegrityResult } from '../types';

/** Minimal v4 transcript shape for verification. */
interface TranscriptV4Like {
  transcript_version?: string;
  intent_id: string;
  created_at_ms: number;
  rounds: TranscriptRoundLike[];
  final_hash?: string;
  failure_event?: { transcript_hash?: string };
}

interface TranscriptRoundLike {
  round_number: number;
  round_type: string;
  envelope_hash: string;
  previous_round_hash: string;
  round_hash?: string;
  public_key_b58?: string;
  signature?: {
    signer_public_key_b58?: string;
    signature_b58?: string;
    scheme?: string;
  };
}

/** Canonical JSON (pure JS, no Node). Sorts keys; no whitespace. */
function stableCanonicalize(obj: unknown): string {
  if (obj === null || obj === undefined) return JSON.stringify(obj);
  if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean')
    return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    const items = obj.map((item) => stableCanonicalize(item));
    return `[${items.join(',')}]`;
  }
  if (typeof obj === 'object') {
    const keys = Object.keys(obj).sort();
    const pairs = keys.map((key) => {
      const value = (obj as Record<string, unknown>)[key];
      return `${JSON.stringify(key)}:${stableCanonicalize(value)}`;
    });
    return `{${pairs.join(',')}}`;
  }
  return JSON.stringify(obj);
}

/**
 * Browser SHA-256: digest bytes with WebCrypto, return hex.
 * Used for checksums (file bytes from unzip) and transcript hash chain.
 */
async function sha256Hex(data: string | ArrayBuffer | Uint8Array): Promise<string> {
  const bytes =
    typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : data instanceof Uint8Array
          ? data
          : new Uint8Array(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Genesis hash for round 0: SHA-256(intent_id:created_at_ms). */
async function computeInitialHash(intentId: string, createdAtMs: number): Promise<string> {
  const combined = `${intentId}:${createdAtMs}`;
  return sha256Hex(combined);
}

/** Round hash (excluding round_hash field). */
async function computeRoundHash(round: TranscriptRoundLike): Promise<string> {
  const { round_hash: _r, ...rest } = round;
  return sha256Hex(stableCanonicalize(rest));
}

/** Transcript hash (excluding final_hash). */
async function computeTranscriptHash(transcript: TranscriptV4Like): Promise<string> {
  const { final_hash: _f, ...rest } = transcript;
  return sha256Hex(stableCanonicalize(rest));
}

/** Verify hash chain; returns status and optional details. */
async function verifyHashChain(
  transcript: TranscriptV4Like
): Promise<{ status: 'VALID' | 'INVALID'; details?: string }> {
  if (transcript.transcript_version !== 'pact-transcript/4.0') {
    return { status: 'INVALID', details: `Invalid transcript version: ${transcript.transcript_version}` };
  }
  const rounds = transcript.rounds ?? [];
  if (rounds.length === 0) {
    return { status: 'INVALID', details: 'Transcript has no rounds' };
  }

  let previousHash: string | undefined;

  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i];
    const expectedPrevious =
      i === 0
        ? await computeInitialHash(transcript.intent_id, transcript.created_at_ms)
        : previousHash!;

    if (round.previous_round_hash !== expectedPrevious) {
      return {
        status: 'INVALID',
        details: `Hash chain broken at round ${i}: previous_round_hash mismatch`,
      };
    }

    const computedRoundHash = await computeRoundHash(round);
    if (round.round_hash != null && round.round_hash !== computedRoundHash) {
      return {
        status: 'INVALID',
        details: `Round hash mismatch at round ${i}`,
      };
    }
    previousHash = round.round_hash ?? computedRoundHash;
  }

  if (transcript.final_hash != null) {
    const computedFinal = await computeTranscriptHash(transcript);
    if (transcript.final_hash !== computedFinal) {
      return { status: 'INVALID', details: 'Final transcript hash mismatch' };
    }
  }

  return { status: 'VALID' };
}

/**
 * Verify Ed25519 signature over envelope hash (not JSON bytes).
 * envelope_hash is SHA-256 hex → 32 bytes; signature_b58 → 64 bytes; public_key_b58 → 32 bytes.
 * nacl.sign.detached.verify(message, signature, publicKey).
 * Failures are recorded in signatures.failures[] by verifySignatures().
 */
function verifySignature(
  envelopeHashHex: string,
  signature: { signer_public_key_b58?: string; signature_b58?: string; scheme?: string },
  publicKeyB58: string
): boolean {
  try {
    if (signature.scheme && signature.scheme !== 'ed25519') return false;
    if (signature.signer_public_key_b58 !== publicKeyB58) return false;
    const hashBytes = hexToBytes(envelopeHashHex); // 32 bytes (envelope hash)
    const sigBytes = bs58.decode(signature.signature_b58!); // 64 bytes
    const pubBytes = bs58.decode(publicKeyB58); // 32 bytes
    return nacl.sign.detached.verify(hashBytes, sigBytes, pubBytes);
  } catch {
    return false;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const len = hex.length / 2;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Verify signatures using public keys in transcript (tweetnacl + bs58, same as verifier). */
function verifySignatures(transcript: TranscriptV4Like): {
  status: 'VALID' | 'INVALID' | 'UNVERIFIABLE';
  verifiedCount: number;
  totalCount: number;
  failures: string[];
} {
  const rounds = transcript.rounds ?? [];
  const failures: string[] = [];
  let verified = 0;

  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i];
    const pub = round.public_key_b58 ?? round.signature?.signer_public_key_b58;
    const sig = round.signature;
    const envelopeHash = round.envelope_hash;

    if (!pub || !sig?.signature_b58 || !envelopeHash) {
      failures.push(`Round ${i}: unverifiable (missing key or signature)`);
      continue;
    }
    const ok = verifySignature(envelopeHash, sig, pub);
    if (ok) {
      verified++;
    } else {
      failures.push(`Round ${i} (${round.round_type}): signature verification failed`);
    }
  }

  const totalCount = rounds.length;
  if (totalCount === 0) {
    return { status: 'UNVERIFIABLE', verifiedCount: 0, totalCount: 0, failures: ['No rounds'] };
  }
  if (failures.length === totalCount && failures.every((f) => f.includes('unverifiable'))) {
    return { status: 'UNVERIFIABLE', verifiedCount: 0, totalCount, failures };
  }
  if (verified === totalCount) {
    return { status: 'VALID', verifiedCount, totalCount, failures: [] };
  }
  return { status: 'INVALID', verifiedCount, totalCount, failures };
}

/**
 * Checksums verification (browser SHA-256).
 * Format: checksums.sha256 lines are "<hex>  <path>" or "<hex> <path>" (single- or double-space).
 * For each line: get file bytes from unzip (allFilesMap → ArrayBuffer), digest with
 * crypto.subtle.digest('SHA-256', bytes), convert to hex, compare to expected hash.
 */
async function verifyChecksums(
  allFilesMap: Map<string, ArrayBuffer>,
  checksumsText: string | null
): Promise<{
  status: 'VALID' | 'INVALID' | 'UNAVAILABLE';
  checkedCount: number;
  totalCount: number;
  failures: string[];
}> {
  if (checksumsText == null || checksumsText.trim() === '') {
    return { status: 'UNAVAILABLE', checkedCount: 0, totalCount: 0, failures: [] };
  }

  const lines = checksumsText.trim().split('\n').filter((l) => l.length > 0);
  const failures: string[] = [];
  let checkedCount = 0;

  for (const line of lines) {
    // <hex> <path> or <hex>  <path>: 64 hex chars then one or more spaces then path
    const match = line.match(/^([a-f0-9]{64})\s+(.+)$/);
    if (!match) {
      failures.push(`Invalid checksum line: ${line}`);
      continue;
    }
    const [, expectedHash, pathRest] = match;
    const relativePath = pathRest.trim();
    const buf = allFilesMap.get(relativePath);
    if (buf == null) {
      failures.push(`File in checksums not found in pack: ${relativePath}`);
      continue;
    }
    const bytes = new Uint8Array(buf);
    const actualHash = await sha256Hex(bytes);
    checkedCount++;
    if (actualHash !== expectedHash) {
      failures.push(`Checksum mismatch for ${relativePath}`);
    }
  }

  const totalCount = lines.length;
  if (failures.length > 0) {
    return { status: 'INVALID', checkedCount, totalCount, failures };
  }
  return { status: 'VALID', checkedCount, totalCount, failures: [] };
}

export interface ComputePackIntegrityArgs {
  transcript: unknown;
  allFilesMap: Map<string, ArrayBuffer>;
  checksumsText: string | null;
}

/**
 * Compute integrity from pack contents only (no network).
 * - Transcript: required; if missing or parse fails => status INDETERMINATE.
 * - Checksums: if present and any mismatch => TAMPERED.
 * - Hash chain: invalid => TAMPERED.
 * - Signatures: Ed25519 via tweetnacl + bs58 (same as @pact/verifier); invalid => TAMPERED.
 * - SHA-256 via WebCrypto (crypto.subtle.digest).
 */
export async function computePackIntegrity(args: ComputePackIntegrityArgs): Promise<IntegrityResult> {
  const { transcript: transcriptObj, allFilesMap, checksumsText } = args;
  const warnings: string[] = [];
  const transcript = transcriptObj as TranscriptV4Like;

  if (!transcript?.rounds?.length) {
    return {
      status: 'INDETERMINATE',
      checksums: { status: 'UNAVAILABLE', checkedCount: 0, totalCount: 0, failures: [] },
      hashChain: { status: 'INVALID', details: 'Transcript missing or has no rounds' },
      signatures: { status: 'UNVERIFIABLE', verifiedCount: 0, totalCount: 0, failures: [] },
      warnings: ['Transcript missing or has no rounds.'],
    };
  }

  const [hashChainResult, checksumsResult] = await Promise.all([
    verifyHashChain(transcript),
    verifyChecksums(allFilesMap, checksumsText),
  ]);

  const signaturesResult = verifySignatures(transcript);

  if (hashChainResult.status === 'INVALID' && hashChainResult.details) {
    warnings.push(hashChainResult.details);
  }
  if (checksumsResult.status === 'INVALID' && checksumsResult.failures.length) {
    warnings.push(...checksumsResult.failures);
  }
  if (signaturesResult.status === 'INVALID' && signaturesResult.failures.length) {
    warnings.push(...signaturesResult.failures);
  }

  // Claimed failure_event transcript_hash vs computed (informational)
  if (transcript.failure_event?.transcript_hash && hashChainResult.status === 'VALID') {
    const { failure_event, final_hash: _f, ...upToFailure } = transcript;
    const computedFailureHash = await sha256Hex(stableCanonicalize(upToFailure));
    if (transcript.failure_event.transcript_hash !== computedFailureHash) {
      warnings.push(
        `Claimed failure-event transcript_hash does not match computed (claimed: ${transcript.failure_event.transcript_hash.substring(0, 16)}..., computed: ${computedFailureHash.substring(0, 16)}...)`
      );
    }
  }

  let status: IntegrityResult['status'];
  if (checksumsResult.status === 'INVALID') status = 'TAMPERED';
  else if (hashChainResult.status === 'INVALID') status = 'TAMPERED';
  else if (signaturesResult.status === 'INVALID') status = 'TAMPERED';
  else status = 'VALID';

  return {
    status,
    checksums: {
      status: checksumsResult.status,
      checkedCount: checksumsResult.checkedCount,
      totalCount: checksumsResult.totalCount,
      failures: checksumsResult.failures,
    },
    hashChain: {
      status: hashChainResult.status,
      details: hashChainResult.details,
    },
    signatures: {
      status: signaturesResult.status,
      verifiedCount: signaturesResult.verifiedCount,
      totalCount: signaturesResult.totalCount,
      failures: signaturesResult.failures,
    },
    warnings,
  };
}
