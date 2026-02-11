/**
 * Extract summary fields from AuditorPackData for the Summary panel.
 * All getters return display-ready values; use "Unknown" or "Not present in this pack" when missing.
 */

import type { AuditorPackData, GCView, Judgment } from '../types';
import { getIntegrityVerdict } from './integrityVerdict';
import type { IntegrityVerdictKind } from './integrityVerdict';
import { deriveOutcomeStatus, type OutcomeBadge } from './outcomeStatus';
import type { ClassifyOutcomeInput } from './summaryState';

const UNKNOWN = 'Unknown';
const NOT_PRESENT = 'Not present in this pack';
/** Field semantics: no "UNAVAILABLE" in badges; use these for data availability. */
export const NOT_RECORDED = 'Not recorded';
export const NOT_APPLICABLE = 'Not applicable';
/** Value present but integrity failed. */
export const CLAIMED_UNTRUSTED = 'Claimed (untrusted)';
/** Legacy pack with no outcome signal. */
export const UNKNOWN_LEGACY = 'Unknown (legacy pack)';

function truncate(s: string, len: number): string {
  if (!s) return UNKNOWN;
  const t = String(s).trim();
  return t.length <= len ? t : t.slice(0, len) + '…';
}

export function getTranscriptId(pack: AuditorPackData): string {
  return pack.transcriptId?.trim() || pack.manifest?.transcript_id?.trim() || UNKNOWN;
}

export function getTimestamp(pack: AuditorPackData): string {
  const ms = pack.manifest?.created_at_ms;
  if (ms == null) return UNKNOWN;
  try {
    return new Date(ms).toISOString();
  } catch {
    return String(ms);
  }
}

/** Transaction purpose / domain from intent_type or pack metadata */
export function getTransactionPurpose(pack: AuditorPackData): string {
  try {
    const t = pack.transcript ? JSON.parse(pack.transcript) : null;
    const intentType = t?.intent_type ?? t?.intent_id;
    if (intentType && typeof intentType === 'string') return intentType;
  } catch {
    // ignore
  }
  return UNKNOWN;
}

export function getBuyerPubkey(pack: AuditorPackData): string | null {
  const parties = pack.gcView?.subject?.parties ?? [];
  const buyer = parties.find((p) => p.role === 'buyer');
  if (buyer?.signer_pubkey) return buyer.signer_pubkey;
  try {
    const t = pack.transcript ? JSON.parse(pack.transcript) : null;
    const rounds = t?.rounds ?? [];
    for (const r of rounds) {
      const pk = r.public_key_b58 ?? r.signature?.signer_public_key_b58;
      if (pk && /buyer|intent|ask/i.test(r.round_type ?? '')) return pk;
    }
  } catch {
    // ignore
  }
  return null;
}

export function getProviderPubkey(pack: AuditorPackData): string | null {
  const parties = pack.gcView?.subject?.parties ?? [];
  const provider = parties.find((p) => p.role === 'provider');
  if (provider?.signer_pubkey) return provider.signer_pubkey;
  try {
    const t = pack.transcript ? JSON.parse(pack.transcript) : null;
    const rounds = t?.rounds ?? [];
    for (const r of rounds) {
      const pk = r.public_key_b58 ?? r.signature?.signer_public_key_b58;
      if (pk && /provider|bid|accept/i.test(r.round_type ?? '')) return pk;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Provider-of-record: settlement recipient. Prefer ACCEPT content_summary.to, then gc_view recipient/to, else getProviderPubkey.
 */
export function getProviderOfRecordPubkey(pack: AuditorPackData): string | null {
  try {
    const t = pack.transcript ? JSON.parse(pack.transcript) : null;
    const rounds = (t?.rounds ?? []) as Array<{ round_type?: string; content_summary?: { to?: string } }>;
    for (let i = rounds.length - 1; i >= 0; i--) {
      const r = rounds[i];
      if (/accept/i.test(r.round_type ?? '')) {
        const to = r.content_summary?.to;
        if (to && typeof to === 'string' && to.trim()) return to.trim();
      }
    }
  } catch {
    // ignore
  }
  const gv = pack.gcView as { executive_summary?: { recipient?: string; to?: string } } | undefined;
  const recipient = gv?.executive_summary?.recipient ?? gv?.executive_summary?.to;
  if (recipient && typeof recipient === 'string' && recipient.trim()) return recipient.trim();
  return getProviderPubkey(pack);
}

/** One other signer (beyond buyer/provider) with optional label from transcript. */
export interface OtherSigner {
  pubkey: string;
  /** agent_id from round when available; otherwise truncated pubkey. */
  agent_label: string;
}

/**
 * Additional unique signers from transcript rounds (beyond buyer and provider).
 * Used for "Other signers" discoverability in the Parties section.
 */
export function getOtherSigners(pack: AuditorPackData): OtherSigner[] {
  const buyerPk = getBuyerPubkey(pack);
  const providerPk = getProviderOfRecordPubkey(pack);
  const seen = new Map<string, string>();

  try {
    const t = pack.transcript ? JSON.parse(pack.transcript) : null;
    const rounds = (t?.rounds ?? []) as Array<{
      agent_id?: string;
      public_key_b58?: string;
      signature?: { signer_public_key_b58?: string };
    }>;
    for (const r of rounds) {
      const pk = r.public_key_b58 ?? r.signature?.signer_public_key_b58;
      if (!pk || pk === buyerPk || pk === providerPk) continue;
      if (!seen.has(pk)) seen.set(pk, (r.agent_id ?? '').trim() || truncate(pk, 12));
    }
  } catch {
    // ignore
  }

  return Array.from(seen.entries(), ([pubkey, agent_label]) => ({
    pubkey,
    agent_label: agent_label || truncate(pubkey, 12),
  }));
}

/** Outcome inputs for summary state machine (classifyOutcome / deriveSummaryState). */
export function getOutcomeInputFromPack(pack: AuditorPackData): ClassifyOutcomeInput {
  const es = pack.gcView?.executive_summary;
  const outcomeCode = es?.final_outcome ?? es?.status ?? undefined;
  let failureCode: string | undefined = (pack.judgment as { failureCode?: string })?.failureCode;
  if (!failureCode && pack.transcript) {
    try {
      const t = JSON.parse(pack.transcript) as { failure_event?: { code?: string } };
      failureCode = t?.failure_event?.code;
    } catch {
      // ignore
    }
  }
  return {
    outcomeCode: outcomeCode ?? null,
    failureCode: failureCode ?? null,
    settlementAttempted: es?.settlement_attempted ?? null,
    moneyMoved: es?.money_moved ?? null,
  };
}

/** Raw transaction status from gc_view (COMPLETED, ABORTED, FAILED, etc.). Never returns TAMPERED_STATUS. */
export function getStatus(gcView: GCView | undefined): string {
  const s = gcView?.executive_summary?.status;
  if (!s) return UNKNOWN;
  if (s === 'TAMPERED_STATUS') return UNKNOWN; // Status is outcome only; never show fake status
  if (s === 'COMPLETED') return 'COMPLETED';
  if (s === 'ABORTED_POLICY') return 'ABORTED';
  if (s.startsWith('FAILED')) return 'FAILED';
  return s;
}

export function getMoneyMoved(gcView: GCView | undefined): 'YES' | 'NO' | 'Unknown' {
  const m = gcView?.executive_summary?.money_moved;
  if (m === true) return 'YES';
  if (m === false) return 'NO';
  return 'Unknown';
}

export function getSettlementAttempted(gcView: GCView | undefined): 'YES' | 'NO' | 'Unknown' {
  const s = gcView?.executive_summary?.settlement_attempted;
  if (s === true) return 'YES';
  if (s === false) return 'NO';
  return 'Unknown';
}

/**
 * Money moved for display. When integrity is TAMPERED or INVALID we must not show YES/NO as fact;
 * execution fields may be untrusted, so we return UNKNOWN. Callers should show the untrusted note
 * (see moneyMovedDisplay.ts) next to the field.
 */
export function getMoneyMovedForDisplay(
  gcView: GCView | undefined,
  integrityVerdict: IntegrityVerdictKind
): string {
  const isUntrusted = integrityVerdict === 'TAMPERED' || integrityVerdict === 'INVALID' || integrityVerdict === 'INDETERMINATE';
  if (isUntrusted) return 'UNKNOWN';
  return getMoneyMoved(gcView);
}

/** Settlement attempted for display. When integrity fails: value present → Claimed (untrusted); else Not recorded. */
export function getSettlementAttemptedForDisplay(
  gcView: GCView | undefined,
  integrityVerdict: IntegrityVerdictKind
): string {
  const isUntrusted = integrityVerdict === 'TAMPERED' || integrityVerdict === 'INVALID' || integrityVerdict === 'INDETERMINATE';
  const raw = getSettlementAttempted(gcView);
  if (isUntrusted && (raw === 'YES' || raw === 'NO')) return CLAIMED_UNTRUSTED;
  if (isUntrusted) return NOT_RECORDED;
  return raw;
}

export function getJudgment(judgment: Judgment | undefined, gcView: GCView | undefined): string {
  const d = judgment?.dblDetermination ?? gcView?.responsibility?.judgment?.fault_domain;
  if (!d || d === '—') return 'NO_FAULT';
  return d;
}

export function getConfidence(judgment: Judgment | undefined, gcView: GCView | undefined): number {
  const c = judgment?.confidence ?? gcView?.responsibility?.judgment?.confidence;
  if (typeof c !== 'number') return 0;
  return Math.min(100, Math.max(0, c * 100));
}

export interface IntegritySummary {
  /** Canonical verdict from integrityVerdict (VERIFIED/INDETERMINATE/INVALID/TAMPERED). */
  status: 'VERIFIED' | 'INVALID' | 'INDETERMINATE' | 'TAMPERED';
  signatures: string;
  hashChain: 'VALID' | 'INVALID' | 'Unknown';
  checksums: 'VALID' | 'INVALID' | 'UNAVAILABLE' | null;
  recompute: 'OK' | 'FAIL' | null;
}

/** Build integrity row from canonical verdict. Use getIntegrityVerdict() for badge/decisions. */
export function getIntegritySummary(pack: AuditorPackData): IntegritySummary {
  const v = getIntegrityVerdict(pack);
  const d = v.details;
  const signatures = d.sigsTotal > 0 ? `${d.sigsVerified}/${d.sigsTotal} verified` : '—';
  const hashChain =
    d.hashChainOk === true ? 'VALID' : d.hashChainOk === false ? 'INVALID' : 'Unknown';
  const checksums: IntegritySummary['checksums'] =
    d.checksumsOk === true ? 'VALID' : d.checksumsOk === false ? 'INVALID' : null;
  const recompute = d.recomputeOk === true ? 'OK' : d.recomputeOk === false ? 'FAIL' : null;
  return {
    status: v.verdict,
    signatures,
    hashChain: hashChain as IntegritySummary['hashChain'],
    checksums,
    recompute,
  };
}

export type OutcomeBadgeKind = 'COMPLETED' | 'ABORTED' | 'FAILED' | 'TAMPERED' | 'INDETERMINATE';

/** Summary outcome badge: VERIFIED → COMPLETED|ABORTED|FAILED|TIMEOUT|UNKNOWN; NOT VERIFIED → CLAIMED | UNAVAILABLE. */
export type SummaryOutcomeBadgeKind = 'COMPLETED' | 'ABORTED' | 'FAILED' | 'TIMEOUT' | 'UNKNOWN' | 'CLAIMED' | 'UNAVAILABLE';

export interface DeriveOutcomeBadgeInput {
  integrity: { recompute: 'OK' | 'FAIL' | null; hashChain: string };
  settlement_attempted: 'YES' | 'NO' | 'Unknown';
  money_moved: 'YES' | 'NO' | 'Unknown';
  outcome_code?: string;
}

/**
 * Map outcome_code / status to raw outcome. Does not consider integrity.
 * Timeout/unreachable → TIMEOUT; other FAILED → FAILED; missing → UNKNOWN.
 */
export function outcomeBadgeFromCode(outcomeCode: string | undefined): SummaryOutcomeBadgeKind {
  if (!outcomeCode || typeof outcomeCode !== 'string') return 'UNKNOWN';
  const code = outcomeCode.trim().toUpperCase();
  if (code === 'COMPLETED') return 'COMPLETED';
  if (code.startsWith('ABORTED')) return 'ABORTED';
  if (code.startsWith('FAILED')) {
    if (code.includes('TIMEOUT') || code.includes('UNREACHABLE') || code.includes('PROVIDER_UNREACHABLE')) return 'TIMEOUT';
    return 'FAILED';
  }
  return 'UNKNOWN';
}

/**
 * One-line explanation under Summary header. Aligned with summaryState.getSummaryExplanationLine.
 * VERIFIED: "Evidence verified. Outcome: <OUTCOME>." INVALID/TAMPERED: untrusted copy. No Trust Signals or Passport.
 */
export function getSummaryExplanation(
  integrity: IntegrityVerdictKind,
  outcome?: OutcomeBadge
): string {
  switch (integrity) {
    case 'VERIFIED':
      return `Evidence verified. Outcome: ${outcome ?? 'UNKNOWN'}.`;
    case 'INVALID':
      return 'This pack failed verification. Outcome and responsibility are untrusted.';
    case 'TAMPERED':
      return 'This pack was altered after signing. Do not rely on outcome or responsibility.';
    case 'INDETERMINATE':
      return 'Integrity could not be fully determined. Treat outcomes with caution.';
    default:
      return '';
  }
}

/**
 * Outcome badge for Summary. Enforcement: when integrity !== VERIFIED,
 * returns UNAVAILABLE (indeterminate) or CLAIMED (invalid/tampered). When VERIFIED: COMPLETED | ABORTED | FAILED | TIMEOUT | UNKNOWN.
 */
export function getOutcomeBadge(
  integrity: IntegrityVerdictKind,
  outcomeCode: string | undefined
): SummaryOutcomeBadgeKind {
  if (integrity === 'INDETERMINATE') return 'UNAVAILABLE';
  if (integrity === 'INVALID' || integrity === 'TAMPERED') return 'CLAIMED';
  if (integrity !== 'VERIFIED') return 'UNAVAILABLE';
  const raw = outcomeBadgeFromCode(outcomeCode);
  return raw === 'UNKNOWN' ? 'UNKNOWN' : raw;
}

/**
 * Derive outcome badge from integrity + transaction fields (legacy; prefer deriveSummaryBadges + outcomeBadgeFromCode).
 */
export function deriveOutcomeBadge(input: DeriveOutcomeBadgeInput): OutcomeBadgeKind {
  const { integrity, settlement_attempted, money_moved } = input;

  if (integrity.recompute === 'FAIL' || integrity.hashChain !== 'VALID') {
    return 'TAMPERED';
  }
  if (settlement_attempted === 'YES' && money_moved === 'YES') {
    return 'COMPLETED';
  }
  if (settlement_attempted === 'NO') {
    return 'ABORTED';
  }
  if (settlement_attempted === 'YES' && money_moved === 'NO') {
    return 'FAILED';
  }
  return 'INDETERMINATE';
}

export interface SummaryBadges {
  /** Canonical integrity verdict (VERIFIED / INDETERMINATE / INVALID / TAMPERED). */
  integrityVerdict: IntegrityVerdictKind;
  /** Outcome badge: when VERIFIED → COMPLETED|ABORTED|FAILED|TIMEOUT|UNKNOWN; else CLAIMED. */
  outcomeBadge: OutcomeBadge;
  /** CSS class for outcome badge. */
  outcomeBadgeClass: string;
  /** Tooltip when outcome is CLAIMED or UNKNOWN. */
  outcomeTooltip: string | undefined;
  outcomeDebugWhy?: string;
  isIntegrityValid: boolean;
  showWarningBanner: boolean;
  summaryExplanation: string;
}

function outcomeBadgeToClass(badge: OutcomeBadge): string {
  switch (badge) {
    case 'COMPLETED':
      return 'status-good';
    case 'ABORTED':
    case 'TIMEOUT':
    case 'UNKNOWN':
      return 'status-warn';
    case 'FAILED':
    case 'CLAIMED':
      return 'status-bad';
    default:
      return 'status-bad';
  }
}

/**
 * Centralized derivation for Summary header badges. Uses deriveOutcomeStatus for canonical outcome.
 * Integrity always first; outcome gated by integrity. Use this in SummaryPanel only.
 */
export function deriveSummaryBadges(pack: AuditorPackData): SummaryBadges {
  const verdict = getIntegrityVerdict(pack);
  const integrity = verdict.verdict;
  const isIntegrityValid = integrity === 'VERIFIED';
  const showWarningBanner = integrity === 'TAMPERED' || integrity === 'INVALID';

  const { badge: outcomeBadge, reason, debugWhy } = deriveOutcomeStatus(integrity, pack);
  const outcomeBadgeClass = outcomeBadgeToClass(outcomeBadge);
  const outcomeTooltip = (outcomeBadge === 'CLAIMED' || outcomeBadge === 'UNKNOWN') ? reason : undefined;

  return {
    integrityVerdict: integrity,
    outcomeBadge,
    outcomeBadgeClass,
    outcomeTooltip,
    outcomeDebugWhy: debugWhy,
    isIntegrityValid,
    showWarningBanner,
    summaryExplanation: getSummaryExplanation(
      integrity,
      integrity === 'VERIFIED' ? outcomeBadge : undefined
    ),
  };
}

/** Status to show in Result. When integrity not VERIFIED: "Claimed (untrusted)". */
export function getStatusForDisplay(
  gcView: GCView | undefined,
  integrityVerdict: IntegrityVerdictKind
): string {
  if (integrityVerdict === 'TAMPERED' || integrityVerdict === 'INVALID' || integrityVerdict === 'INDETERMINATE') {
    const raw = getStatus(gcView);
    return raw !== UNKNOWN && raw !== '' ? CLAIMED_UNTRUSTED : NOT_RECORDED;
  }
  return getStatus(gcView);
}

export interface EconomicDetails {
  asset: string;
  amount: string;
  from: string;
  to: string;
  rail: string;
  reference?: string;
}

export function getEconomicDetails(pack: AuditorPackData): EconomicDetails {
  return getEconomicDetailsInternal(pack, false, getStatus(pack.gcView));
}

/** When untrusted, returns placeholder; use getEconomicDisclaimer for single-line collapse. */
export function getEconomicDetailsForDisplay(
  pack: AuditorPackData,
  integrityVerdict: IntegrityVerdictKind
): EconomicDetails {
  const untrusted = integrityVerdict === 'TAMPERED' || integrityVerdict === 'INVALID' || integrityVerdict === 'INDETERMINATE';
  const status = getStatus(pack.gcView);
  return getEconomicDetailsInternal(pack, untrusted, status);
}

/** Single disclaimer when integrity not VERIFIED (collapse Economic Snapshot to this line). */
export const ECONOMIC_DISCLAIMER_UNTRUSTED = 'Economic details cannot be trusted. See Technical Verification.';

/** Footnote for Economic Snapshot when VERIFIED: missing fields note. */
export function getEconomicFootnote(
  pack: AuditorPackData,
  integrityVerdict: IntegrityVerdictKind
): string | null {
  const untrusted = integrityVerdict === 'TAMPERED' || integrityVerdict === 'INVALID' || integrityVerdict === 'INDETERMINATE';
  if (untrusted) return null; // UI shows ECONOMIC_DISCLAIMER_UNTRUSTED instead of grid
  const details = getEconomicDetailsForDisplay(pack, integrityVerdict);
  const hasMissing =
    details.asset === NOT_RECORDED ||
    details.amount === NOT_RECORDED ||
    details.rail === NOT_RECORDED ||
    details.reference === NOT_RECORDED ||
    details.reference === NOT_APPLICABLE;
  if (hasMissing) return 'Some economic fields are not recorded in this pack.';
  return null;
}

function getEconomicDetailsInternal(
  pack: AuditorPackData,
  untrusted: boolean,
  status: string
): EconomicDetails {
  const buyer = getBuyerPubkey(pack);
  const provider = getProviderOfRecordPubkey(pack);
  if (untrusted) {
    return {
      asset: CLAIMED_UNTRUSTED,
      amount: CLAIMED_UNTRUSTED,
      from: buyer ? truncate(buyer, 12) : NOT_RECORDED,
      to: provider ? truncate(provider, 12) : NOT_RECORDED,
      rail: CLAIMED_UNTRUSTED,
      reference: CLAIMED_UNTRUSTED,
    };
  }
  let asset = NOT_RECORDED;
  let amount = NOT_RECORDED;
  let rail = NOT_RECORDED;
  let reference: string | undefined = status === 'ABORTED' ? NOT_APPLICABLE : undefined;

  try {
    const t = pack.transcript ? JSON.parse(pack.transcript) : null;
    const rounds = t?.rounds ?? [];
    for (const r of rounds) {
      const payload = r.payload ?? r;
      if (payload.asset != null) asset = String(payload.asset);
      if (payload.amount != null) amount = String(payload.amount);
      if (payload.currency != null) asset = String(payload.currency);
      if (payload.settlement_rail != null) rail = String(payload.settlement_rail);
      if (payload.settlement_reference != null) reference = String(payload.settlement_reference);
    }
    const gv = pack.gcView as { economic?: { asset?: string; amount?: string; rail?: string; reference?: string } };
    if (gv?.economic?.asset) asset = gv.economic.asset;
    if (gv?.economic?.amount) amount = gv.economic.amount;
    if (gv?.economic?.rail) rail = gv.economic.rail;
    if (gv?.economic?.reference) reference = gv.economic.reference;
    const ed = (pack.insurerSummary as { economic_details?: { asset?: string | null; amount?: string | null; from?: string | null; to?: string | null; settlement_rail?: string | null } })?.economic_details;
    if (ed?.asset != null && String(ed.asset).trim()) asset = String(ed.asset);
    if (ed?.amount != null && String(ed.amount).trim()) amount = String(ed.amount);
    if (ed?.settlement_rail != null && String(ed.settlement_rail).trim()) rail = String(ed.settlement_rail);
  } catch {
    // ignore
  }

  // Settlement reference: Not applicable for ABORTED; Not recorded for COMPLETED if missing
  if (reference == null || reference === '') {
    reference = status === 'ABORTED' ? NOT_APPLICABLE : NOT_RECORDED;
  }

  return {
    asset,
    amount,
    from: buyer ? truncate(buyer, 12) : NOT_RECORDED,
    to: provider ? truncate(provider, 12) : NOT_RECORDED,
    rail,
    reference,
  };
}

/** Prefer transcript final_hash, then last_valid_signed_hash, then transcript_id */
export function getRecordHash(pack: AuditorPackData): string | null {
  try {
    const t = pack.transcript ? JSON.parse(pack.transcript) : null;
    if (t?.final_hash?.trim()) return t.final_hash.trim();
  } catch {
    // ignore
  }
  const lvsh = pack.gcView?.responsibility?.last_valid_signed_hash?.trim();
  if (lvsh) return lvsh;
  const tid = pack.transcriptId?.trim() || pack.manifest?.transcript_id?.trim();
  if (tid) return tid;
  return null;
}

export interface TransactionHashResult {
  hash: string;
  isFallback: boolean;
}

/**
 * Canonical Transaction Hash for stable lookup.
 * Source order: 1) final transcript hash, 2) LVSH, 3) snapshot_id, 4) transcript_id (fallback).
 */
export function getTransactionHash(pack: AuditorPackData): TransactionHashResult {
  try {
    const t = pack.transcript ? JSON.parse(pack.transcript) : null;
    if (t?.final_hash?.trim()) return { hash: t.final_hash.trim(), isFallback: false };
  } catch {
    // ignore
  }
  const lvsh = pack.gcView?.responsibility?.last_valid_signed_hash?.trim();
  if (lvsh) return { hash: lvsh, isFallback: false };
  const snapshot = pack.manifest?.passport_snapshot ?? pack.boxerSnapshot;
  const snapshotId = typeof snapshot === 'object' && snapshot != null && 'snapshot_id' in snapshot
    ? (snapshot as { snapshot_id?: string }).snapshot_id
    : undefined;
  if (typeof snapshotId === 'string' && snapshotId.trim()) return { hash: snapshotId.trim(), isFallback: false };
  const tid = pack.transcriptId?.trim() || pack.manifest?.transcript_id?.trim();
  if (tid) return { hash: tid, isFallback: true };
  return { hash: '', isFallback: true };
}

export interface AttemptsResult {
  display: string;
  isUnknown: boolean;
}

/**
 * Attempts: settlement_attempts from pack, execution steps retries, or default 1.
 */
export function getAttempts(pack: AuditorPackData): AttemptsResult {
  const settlementAttempts = (pack.gcView as { settlement_attempts?: Array<{ status?: string }> })?.settlement_attempts;
  if (Array.isArray(settlementAttempts) && settlementAttempts.length > 0) {
    const failed = settlementAttempts.filter((a) => a.status === 'FAILED' || a.status === 'failed').length;
    const succeeded = settlementAttempts.filter((a) => a.status === 'COMPLETED' || a.status === 'succeeded').length;
    if (failed > 0 || succeeded > 1) {
      return { display: `${settlementAttempts.length} (${failed} failed, ${succeeded} succeeded)`, isUnknown: false };
    }
    return { display: String(settlementAttempts.length), isUnknown: false };
  }
  const steps = (pack.gcView as { timeline?: unknown[] })?.timeline;
  if (Array.isArray(steps) && steps.length > 0) {
    const settlementSteps = steps.filter((s: unknown) => {
      const ev = (s as { event?: string })?.event;
      return ev === 'SETTLEMENT' || (typeof ev === 'string' && ev.includes('settlement'));
    });
    if (settlementSteps.length > 1) {
      return { display: String(settlementSteps.length), isUnknown: false };
    }
  }
  const es = pack.gcView?.executive_summary;
  if (es?.settlement_attempted != null || es?.money_moved != null) {
    return { display: '1', isUnknown: false };
  }
  return { display: 'Unknown (not recorded in this pack)', isUnknown: true };
}

export { truncate as summaryTruncate };
export { UNKNOWN, NOT_PRESENT };
