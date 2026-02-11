/**
 * Party/Passport helpers: match entity from Boxer snapshot and build local history rows.
 * No backend calls; uses loaded pack + optional passport snapshot only.
 */

import type { AuditorPackData, PassportSnapshotView, PassportEntityView } from '../types';
import { getIntegrityVerdict, getIntegrityVerdictLabel, type IntegrityVerdictKind } from './integrityVerdict';
import {
  getTranscriptId,
  getTimestamp,
  getTransactionPurpose,
  getStatusForDisplay,
  getJudgment,
  getConfidence,
  getBuyerPubkey,
  getProviderOfRecordPubkey,
} from './summaryExtract';

/** Normalize pubkey for comparison (trim, same casing). */
function norm(pubkey: string): string {
  return String(pubkey || '').trim();
}

/**
 * Match entity in snapshot by signer_public_key_b58.
 * If multiple entities match (e.g. different software_attestation), prefer non-unknown attestation,
 * else highest reliability for first domain.
 */
export function matchEntity(
  snapshot: PassportSnapshotView | null | undefined,
  pubkey: string
): PassportEntityView | null {
  if (!snapshot?.entities?.length || !pubkey) return null;
  const key = norm(pubkey);
  const matches = snapshot.entities.filter(
    (e) => norm(e.signer_public_key_b58 ?? '') === key
  );
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0]!;

  // Prefer non-unknown attestation
  const withAttestation = matches.filter((e) => {
    const a = e.software_attestation;
    return a?.agent_impl_id && a.agent_impl_id !== 'unknown';
  });
  const candidates = withAttestation.length > 0 ? withAttestation : matches;

  // Else prefer highest reliability for first domain
  const withReliability = candidates
    .map((e) => {
      const score =
        e.domains?.[0]?.metrics?.reliability_score ?? 0;
      return { e, score };
    })
    .sort((a, b) => (b.score - a.score));
  return withReliability[0]?.e ?? candidates[0] ?? null;
}

export interface LocalHistoryRow {
  timestamp: string;
  transcriptId: string;
  purpose: string;
  status: string;
  judgment: string;
  confidence: number;
  integrity: string;
  /** For badge enforcement: outcome must be CLAIMED/UNAVAILABLE when not VERIFIED */
  integrityVerdictKind: IntegrityVerdictKind;
}

/**
 * Build local history rows for a party. Minimum: one row for the current pack
 * if the pubkey is buyer or provider in that transcript.
 * No fake history; only include current pack for now (snapshot source_manifest_hashes
 * are not mapped to local transcripts).
 */
export function buildLocalHistoryRows(
  pack: AuditorPackData,
  _snapshot: PassportSnapshotView | null | undefined,
  pubkey: string
): LocalHistoryRow[] {
  const key = norm(pubkey);
  if (!key) return [];

  const buyerPk = getBuyerPubkey(pack);
  const providerPk = getProviderOfRecordPubkey(pack);
  const isBuyer = buyerPk && norm(buyerPk) === key;
  const isProvider = providerPk && norm(providerPk) === key;
  if (!isBuyer && !isProvider) return [];

  const verdict = getIntegrityVerdict(pack);
  const status = getStatusForDisplay(pack.gcView, verdict.verdict);
  const rawJudgment = getJudgment(pack.judgment, pack.gcView);
  const rawConfidence = getConfidence(pack.judgment, pack.gcView);
  const isUntrusted = verdict.verdict === 'TAMPERED' || verdict.verdict === 'INVALID';
  const judgment = isUntrusted ? 'Judgment unavailable (untrusted evidence)' : rawJudgment;
  const confidence = isUntrusted ? 0 : rawConfidence;

  const row: LocalHistoryRow = {
    timestamp: getTimestamp(pack),
    transcriptId: getTranscriptId(pack),
    purpose: getTransactionPurpose(pack),
    status,
    judgment,
    confidence,
    integrity: getIntegrityVerdictLabel(verdict.verdict),
    integrityVerdictKind: verdict.verdict,
  };

  return [row];
}

/** Derive roles (Buyer/Provider/Expert) for a pubkey from pack transcript and gc_view. */
export function getRolesForPubkey(pack: AuditorPackData, pubkey: string): string[] {
  const key = norm(pubkey);
  if (!key) return [];

  const roles: string[] = [];
  const parties = pack.gcView?.subject?.parties ?? [];
  for (const p of parties) {
    if (norm(p.signer_pubkey) === key) {
      if (p.role === 'buyer') roles.push('Buyer');
      if (p.role === 'provider') roles.push('Provider');
    }
  }

  try {
    const t = pack.transcript ? JSON.parse(pack.transcript) : null;
    const rounds = t?.rounds ?? [];
    for (const r of rounds) {
      const pk = r.public_key_b58 ?? r.signature?.signer_public_key_b58;
      if (!pk || norm(pk) !== key) continue;
      const rt = (r.round_type ?? '').toUpperCase();
      if (/INTENT|ASK/i.test(rt) && !roles.includes('Buyer')) roles.push('Buyer');
      if (/BID|ACCEPT|COUNTER|REJECT/i.test(rt) && !roles.includes('Provider')) roles.push('Provider');
      if (/ARBITER|JUDGE|EXPERT|THIRD_PARTY/i.test(rt) && !roles.includes('Expert')) roles.push('Expert');
    }
  } catch {
    // ignore
  }

  if (roles.length === 0) roles.push('Party');
  return [...new Set(roles)];
}

export interface RoundParticipatedRow {
  round_number: number;
  round_type: string;
}

/**
 * Rounds where this pubkey signed. For all parties (buyer, provider, contributors).
 */
export function buildRoundsParticipatedIn(
  pack: AuditorPackData,
  pubkey: string
): RoundParticipatedRow[] {
  const key = norm(pubkey);
  if (!key) return [];
  const rows: RoundParticipatedRow[] = [];
  try {
    const t = pack.transcript ? JSON.parse(pack.transcript) : null;
    const rounds = (t?.rounds ?? []) as Array<{
      round_number?: number;
      round_type?: string;
      public_key_b58?: string;
      signature?: { signer_public_key_b58?: string };
    }>;
    for (const r of rounds) {
      const pk = r.public_key_b58 ?? r.signature?.signer_public_key_b58;
      if (!pk || norm(pk) !== key) continue;
      rows.push({
        round_number: r.round_number ?? rows.length + 1,
        round_type: (r.round_type ?? 'UNKNOWN').toUpperCase(),
      });
    }
  } catch {
    // ignore
  }
  return rows;
}

export interface ClaimRow {
  subject?: string;
  value?: string;
  confidence?: number;
  claim_type?: string;
}

/** Normalize a claim from content_summary.claims to ClaimRow (handles value/conf, authenticity_likelihood, provenance_valid). */
function normalizeClaim(c: Record<string, unknown>): ClaimRow {
  const value =
    c.value != null
      ? String(c.value)
      : c.authenticity_likelihood != null
        ? String(c.authenticity_likelihood)
        : c.provenance_valid != null
          ? String(c.provenance_valid)
          : undefined;
  const confidence =
    c.confidence != null
      ? Number(c.confidence)
      : c.conf != null
        ? Number(c.conf)
        : undefined;
  return {
    subject: typeof c.subject === 'string' ? c.subject : undefined,
    value: value ?? undefined,
    confidence: confidence != null && !Number.isNaN(confidence) ? confidence : undefined,
    claim_type: typeof c.claim_type === 'string' ? c.claim_type : undefined,
  };
}

/**
 * Claims made in rounds where this pubkey signed (from content_summary.claims).
 * For all parties including contributors.
 * Handles both standard shape (value, confidence) and alternate (conf, authenticity_likelihood, provenance_valid).
 */
export function buildClaimsForParty(
  pack: AuditorPackData,
  pubkey: string
): ClaimRow[] {
  const key = norm(pubkey);
  if (!key) return [];
  const claims: ClaimRow[] = [];
  try {
    const t = pack.transcript ? JSON.parse(pack.transcript) : null;
    const rounds = (t?.rounds ?? []) as Array<{
      public_key_b58?: string;
      signature?: { signer_public_key_b58?: string };
      content_summary?: { claims?: Array<Record<string, unknown>> };
    }>;
    for (const r of rounds) {
      const pk = r.public_key_b58 ?? r.signature?.signer_public_key_b58;
      if (!pk || norm(pk) !== key) continue;
      const list = r.content_summary?.claims ?? [];
      for (const c of list) {
        if (c && typeof c === 'object') claims.push(normalizeClaim(c));
      }
    }
  } catch {
    // ignore
  }
  return claims;
}
