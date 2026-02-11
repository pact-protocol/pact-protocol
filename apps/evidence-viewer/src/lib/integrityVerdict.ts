/**
 * Canonical integrity verdict derived from pack subchecks.
 * Used for Summary badge and consistent labeling; does not change verifier or pack contents.
 */

import type { AuditorPackData, IntegrityResult } from '../types';

export type IntegrityVerdictKind = 'VERIFIED' | 'INDETERMINATE' | 'INVALID' | 'TAMPERED';
export type IntegrityVerdictColor = 'green' | 'amber' | 'red';

export interface IntegrityVerdictDetails {
  checksumsOk: boolean | null;
  hashChainOk: boolean | null;
  sigsVerified: number;
  sigsTotal: number;
  recomputeOk: boolean | null;
}

export interface IntegrityVerdict {
  verdict: IntegrityVerdictKind;
  color: IntegrityVerdictColor;
  details: IntegrityVerdictDetails;
}

function getRecomputeOk(pack: AuditorPackData): boolean | null {
  const pv = pack.packVerifyResult as { recompute_ok?: boolean } | undefined;
  if (pv?.recompute_ok === true) return true;
  if (pv?.recompute_ok === false) return false;
  return null;
}

function getChecksumsOk(pack: AuditorPackData): boolean | null {
  const ir = pack.integrityResult;
  const pv = pack.packVerifyResult as { checksums_ok?: boolean } | undefined;
  if (pv?.checksums_ok === true) return true;
  if (pv?.checksums_ok === false) return false;
  if (ir?.checksums?.status === 'VALID') return true;
  if (ir?.checksums?.status === 'INVALID') return false;
  return null;
}

function getHashChainOk(pack: AuditorPackData): boolean | null {
  const int = pack.gcView?.integrity;
  const ir = pack.integrityResult;
  const h = int?.hash_chain ?? ir?.hashChain?.status;
  if (h === 'VALID') return true;
  if (h === 'INVALID') return false;
  return null;
}

/**
 * Expected signature count = transcript.rounds.length (dynamic per pack).
 * Do not hardcode 3/3; 2/2 is valid for 420 and other short transcripts.
 */
function getExpectedSignatureCountFromTranscript(transcriptJson: string | undefined): number | null {
  if (!transcriptJson) return null;
  try {
    const t = JSON.parse(transcriptJson) as { rounds?: unknown[] };
    if (Array.isArray(t?.rounds)) return t.rounds.length;
  } catch {
    // ignore
  }
  return null;
}

function getSignaturesCounts(pack: AuditorPackData): { verified: number; total: number } {
  const int = pack.gcView?.integrity;
  const ir = pack.integrityResult;
  const verified = int?.signatures_verified?.verified ?? ir?.signatures?.verifiedCount ?? 0;
  const reportedTotal = int?.signatures_verified?.total ?? ir?.signatures?.totalCount ?? 0;
  const expectedFromTranscript = getExpectedSignatureCountFromTranscript(pack.transcript);
  const total =
    expectedFromTranscript != null ? expectedFromTranscript : reportedTotal;
  return { verified, total };
}

/**
 * Derives a single canonical integrity verdict from pack subchecks.
 * Priority: TAMPERED > INDETERMINATE (if explicit) > INVALID (any subcheck failed) > VERIFIED.
 */
export function getIntegrityVerdict(pack: AuditorPackData): IntegrityVerdict {
  const ir = pack.integrityResult as IntegrityResult | undefined;
  const recomputeOk = getRecomputeOk(pack);
  const checksumsOk = getChecksumsOk(pack);
  const hashChainOk = getHashChainOk(pack);
  const { verified: sigsVerified, total: sigsTotal } = getSignaturesCounts(pack);

  const details: IntegrityVerdictDetails = {
    checksumsOk,
    hashChainOk,
    sigsVerified,
    sigsTotal,
    recomputeOk,
  };

  // 1) Tamper: recompute failed or pack/viewer already says TAMPERED
  if (recomputeOk === false || ir?.status === 'TAMPERED') {
    return { verdict: 'TAMPERED', color: 'red', details };
  }

  // 2) Explicit INDETERMINATE from pack (e.g. no verifier run), and not tampered
  if (ir?.status === 'INDETERMINATE') {
    return { verdict: 'INDETERMINATE', color: 'amber', details };
  }

  // 3) Any subcheck failed -> INVALID (evidence not trustworthy)
  const checksumsInvalid = checksumsOk === false;
  const hashChainInvalid = hashChainOk === false;
  const sigsNotFull = sigsTotal > 0 && sigsVerified < sigsTotal;
  if (checksumsInvalid || hashChainInvalid || sigsNotFull) {
    return { verdict: 'INVALID', color: 'red', details };
  }

  // 4) All pass
  return { verdict: 'VERIFIED', color: 'green', details };
}

/** Badge label for Summary header and Integrity row */
export function getIntegrityVerdictLabel(verdict: IntegrityVerdictKind): string {
  switch (verdict) {
    case 'VERIFIED':
      return '✓ VERIFIED';
    case 'INDETERMINATE':
      return '⚠ INDETERMINATE';
    case 'INVALID':
      return '✖ INVALID';
    case 'TAMPERED':
      return '⛔ TAMPERED';
    default:
      return String(verdict);
  }
}

/** CSS class for verdict (status-good / status-warn / status-bad) */
export function getIntegrityVerdictClass(verdict: IntegrityVerdictKind): string {
  switch (verdict) {
    case 'VERIFIED':
      return 'status-good';
    case 'INDETERMINATE':
      return 'status-warn';
    case 'INVALID':
    case 'TAMPERED':
      return 'status-bad';
    default:
      return 'status-warn';
  }
}
