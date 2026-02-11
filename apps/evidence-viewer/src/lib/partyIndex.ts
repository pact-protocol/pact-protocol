/**
 * Party Index: single source of truth for party taxonomy and display.
 * Derives from loaded auditor pack (transcript rounds) + optional Boxer snapshot.
 * No backend calls; no protocol changes.
 */

import type { AuditorPackData, PassportSnapshotView, PassportEntityView } from '../types';
import { getBuyerPubkey, getProviderPubkey, getProviderOfRecordPubkey } from './summaryExtract';
import { matchEntity } from './partyPassport';

function norm(pubkey: string): string {
  return String(pubkey ?? '').trim();
}

function truncatePubkey(pk: string, len = 12): string {
  return pk.length <= len ? pk : pk.slice(0, len) + '…';
}

export type PartyRole = 'buyer' | 'provider' | 'expert' | 'agent' | 'unknown';

export interface AnchorView {
  type: string;
  display_name?: string;
  verification_method?: string;
  issuer?: string;
  anchor_id?: string;
  revoked?: boolean;
  revoked_at_ms?: number | null;
  reason?: string | null;
  revocation_ref?: string | null;
}

export interface PartyTrust {
  reliability?: number;
  calibration?: number | null;
}

export interface PartyEntry {
  pubkey: string;
  role: PartyRole;
  agent_id?: string;
  display_name: string;
  anchors: AnchorView[];
  trust?: PartyTrust;
  seen_in_rounds: Array<{ round_index: number; round_type: string }>;
}

export type PartyIndex = Map<string, PartyEntry>;

interface RoundLike {
  round_number?: number;
  round_type?: string;
  agent_id?: string;
  public_key_b58?: string;
  signature?: { signer_public_key_b58?: string };
}

function parseRounds(pack: AuditorPackData): RoundLike[] {
  try {
    const t = pack.transcript ? JSON.parse(pack.transcript) : null;
    return (t?.rounds ?? []) as RoundLike[];
  } catch {
    return [];
  }
}

/**
 * Determine provider pubkey for role classification: provider-of-record first (ACCEPT to), else gc_view/rounds fallback.
 */
function getProviderPubkeyFromRounds(pack: AuditorPackData, rounds: RoundLike[]): string | null {
  const ofRecord = getProviderOfRecordPubkey(pack);
  if (ofRecord) return ofRecord;
  const fromParties = getProviderPubkey(pack);
  if (fromParties) return fromParties;
  for (const r of rounds) {
    const pk = r.public_key_b58 ?? r.signature?.signer_public_key_b58;
    if (pk && (r.round_type === 'ASK' || r.agent_id === 'gallery')) return pk;
  }
  return null;
}

/**
 * Classify role: credential_verified → Expert first; then Buyer/Provider by protocol; else Agent.
 * Experts are surfaced explicitly because they influence judgment and carry liability weight.
 */
function classifyRole(
  pubkey: string,
  buyerPk: string | null,
  providerPk: string | null,
  agentId: string | undefined,
  hasCredentialVerified: boolean
): PartyRole {
  const key = norm(pubkey);
  if (hasCredentialVerified) return 'expert';
  if (buyerPk && norm(buyerPk) === key) return 'buyer';
  if (providerPk && norm(providerPk) === key) return 'provider';
  if (agentId) return 'agent';
  return 'unknown';
}

/**
 * Build party index from loaded pack and optional Boxer snapshot.
 * Deterministic: same inputs → same output. Safe fallbacks for missing data.
 */
export function buildPartyIndex(
  pack: AuditorPackData,
  boxerSnapshot: PassportSnapshotView | null | undefined
): PartyIndex {
  const buyerPk = getBuyerPubkey(pack);
  const rounds = parseRounds(pack);
  const providerPk = getProviderPubkeyFromRounds(pack, rounds);

  const byPubkey = new Map<string, { agent_id?: string; seen_in_rounds: Array<{ round_index: number; round_type: string }> }>();

  rounds.forEach((r, i) => {
    const pk = r.public_key_b58 ?? r.signature?.signer_public_key_b58;
    if (!pk) return;
    const key = norm(pk);
    if (!byPubkey.has(key)) {
      byPubkey.set(key, { agent_id: r.agent_id, seen_in_rounds: [] });
    }
    const entry = byPubkey.get(key)!;
    entry.seen_in_rounds.push({ round_index: r.round_number ?? i, round_type: r.round_type ?? '—' });
    if (r.agent_id) entry.agent_id = r.agent_id;
  });

  const index: PartyIndex = new Map();

  for (const [pubkey, { agent_id, seen_in_rounds }] of byPubkey.entries()) {
    const entity = matchEntity(boxerSnapshot ?? null, pubkey);
    const anchors: AnchorView[] = (entity?.anchors ?? []).map((a) => ({
      type: a.type ?? 'anchor',
      display_name: a.display_name,
      verification_method: a.verification_method,
      issuer: a.issuer,
      anchor_id: a.anchor_id,
      revoked: a.revoked,
      revoked_at_ms: a.revoked_at_ms,
      reason: a.reason,
      revocation_ref: a.revocation_ref,
    }));
    const hasCredentialVerified = anchors.some((a) => (a.type ?? '').toLowerCase().includes('credential'));

    const role = classifyRole(pubkey, buyerPk, providerPk, agent_id, hasCredentialVerified);

    let display_name: string =
      anchors[0]?.display_name ?? anchors[0]?.issuer ?? agent_id ?? truncatePubkey(pubkey);
    display_name = display_name.trim() || truncatePubkey(pubkey);

    const firstDomain = entity?.domains?.[0];
    const trust: PartyTrust | undefined =
      firstDomain?.metrics?.reliability_score != null || firstDomain?.metrics?.calibration_score != null
        ? {
            reliability: firstDomain?.metrics?.reliability_score,
            calibration: firstDomain?.metrics?.calibration_score ?? null,
          }
        : undefined;

    index.set(pubkey, {
      pubkey,
      role,
      agent_id: agent_id?.trim() || undefined,
      display_name,
      anchors,
      trust,
      seen_in_rounds,
    });
  }

  return index;
}

/** Get buyer entry from index (by pubkey). */
export function getBuyerEntry(index: PartyIndex, pack: AuditorPackData): PartyEntry | null {
  const pk = getBuyerPubkey(pack);
  return pk ? index.get(pk) ?? null : null;
}

/** Get provider-of-record entry from index. */
export function getProviderEntry(index: PartyIndex, pack: AuditorPackData): PartyEntry | null {
  const pk = getProviderOfRecordPubkey(pack);
  return pk ? index.get(pk) ?? null : null;
}

/** All parties with role expert. */
export function getExpertParties(index: PartyIndex): PartyEntry[] {
  return Array.from(index.values()).filter((p) => p.role === 'expert');
}

/** All parties that are not buyer or provider-of-record (experts + other agents). */
export function getNonPrimaryParties(index: PartyIndex, pack: AuditorPackData): PartyEntry[] {
  const buyerPk = getBuyerPubkey(pack);
  const providerPk = getProviderOfRecordPubkey(pack);
  return Array.from(index.values()).filter((p) => {
    const key = norm(p.pubkey);
    if (buyerPk && norm(buyerPk) === key) return false;
    if (providerPk && norm(providerPk) === key) return false;
    return true;
  });
}

/** Experts only from index. */
export function getExpertContributors(index: PartyIndex): PartyEntry[] {
  return getExpertParties(index);
}

/** Other agents (non-buyer, non-provider, non-expert). */
export function getOtherAgents(index: PartyIndex, pack: AuditorPackData): PartyEntry[] {
  const experts = new Set(getExpertParties(index).map((e) => e.pubkey));
  return getNonPrimaryParties(index, pack).filter((p) => !experts.has(p.pubkey));
}

/** Get entry by pubkey. */
export function getPartyByPubkey(index: PartyIndex, pubkey: string): PartyEntry | null {
  const key = norm(pubkey);
  for (const [pk, entry] of index.entries()) {
    if (norm(pk) === key) return entry;
  }
  return null;
}

/** Role label for UI (Buyer, Provider, Expert, Agent, Unknown). */
export function getRoleLabel(role: PartyRole): string {
  switch (role) {
    case 'buyer':
      return 'Buyer';
    case 'provider':
      return 'Provider';
    case 'expert':
      return 'Expert';
    case 'agent':
      return 'Agent';
    default:
      return 'Unknown';
  }
}

/** Anchor type (+ optional verification_method) to short badge label (Credential, KYB, Stripe Verified, Platform, Service Account, OIDC). */
export function getAnchorBadgeLabel(
  type: string | undefined,
  verificationMethod?: string | null
): string | null {
  if (!type) return null;
  const t = type.toLowerCase();
  const method = (verificationMethod ?? '').toLowerCase();
  if (t.includes('credential')) return 'Credential';
  if (t.includes('kyb')) return 'KYB';
  if (t.includes('platform') && method === 'stripe') return 'Stripe Verified';
  if (t.includes('platform') || t.includes('domain')) return 'Platform';
  if (t.includes('service_account')) return 'Service Account Verified';
  if (t.includes('oidc')) return 'OIDC Verified';
  return null;
}

/** Whether the party has at least one revoked anchor. */
export function hasRevokedAnchor(anchors: AnchorView[]): boolean {
  return anchors.some((a) => a.revoked === true);
}

/** Contributor from transcript only: any signer that is not buyer or settlement provider. */
export interface ContributorFromTranscript {
  pubkey: string;
  agent_id?: string;
  roundCount: number;
}

/**
 * Get contributors from transcript: entities that appear in rounds as signers
 * but are NOT the buyer or settlement provider.
 */
export function getContributors(
  transcript: string | undefined,
  buyerKey: string | null,
  providerKey: string | null
): ContributorFromTranscript[] {
  const seen = new Map<string, { agent_id?: string; count: number }>();
  const n = (s: string) => String(s ?? '').trim();
  try {
    const t = transcript ? JSON.parse(transcript) : null;
    const rounds = (t?.rounds ?? []) as Array<{
      round_number?: number;
      agent_id?: string;
      public_key_b58?: string;
      signature?: { signer_public_key_b58?: string };
    }>;
    for (const r of rounds) {
      const pk = r.public_key_b58 ?? r.signature?.signer_public_key_b58;
      if (!pk || (buyerKey && n(pk) === n(buyerKey)) || (providerKey && n(pk) === n(providerKey))) continue;
      const key = n(pk);
      if (!seen.has(key)) seen.set(key, { agent_id: r.agent_id, count: 0 });
      const e = seen.get(key)!;
      e.count += 1;
      if (r.agent_id) e.agent_id = r.agent_id;
    }
  } catch {
    // ignore
  }
  return Array.from(seen.entries(), ([pubkey, { agent_id, count }]) => ({
    pubkey,
    agent_id,
    roundCount: count,
  }));
}

/**
 * Resolve display name: prefer anchor display_name/issuer, else agent_id, else truncated pubkey.
 */
export function resolveDisplayName(
  entity: PassportEntityView | null | undefined,
  anchors: AnchorView[],
  agentId: string | undefined,
  pubkey: string
): string {
  const fromAnchor = anchors[0]?.display_name ?? anchors[0]?.issuer;
  if (fromAnchor?.trim()) return fromAnchor.trim();
  if (entity?.anchors?.[0]?.display_name) return entity.anchors[0].display_name!.trim();
  if (entity?.anchors?.[0]?.issuer) return entity.anchors[0].issuer!.trim();
  if (agentId?.trim()) return agentId.trim();
  return truncatePubkey(pubkey, 12);
}

/** All contributors (non-buyer, non-provider) with full party entry; use for Contributors section. */
export function getContributorsWithEntries(
  index: PartyIndex,
  pack: AuditorPackData
): PartyEntry[] {
  return getNonPrimaryParties(index, pack);
}

/** View model for unified Parties section: one row per party with display role. */
export interface PartyViewModel {
  pubkey: string;
  role: PartyRole;
  agent_id?: string;
  display_name: string;
  anchors: AnchorView[];
  revoked_any: boolean;
  rounds_signed: number;
  domain_count: number;
}

/** Create a minimal PartyEntry for a pubkey not in index (e.g. buyer/provider from gc_view only). */
function getOrCreateEntry(
  index: PartyIndex,
  pack: AuditorPackData,
  pubkey: string,
  role: PartyRole,
  boxerSnapshot?: PassportSnapshotView | null
): PartyEntry {
  const key = norm(pubkey);
  for (const [pk, entry] of index.entries()) {
    if (norm(pk) === key) return entry;
  }
  const entity = matchEntity(boxerSnapshot ?? null, pubkey);
  const anchors: AnchorView[] = (entity?.anchors ?? []).map((a) => ({
    type: a.type ?? 'anchor',
    display_name: a.display_name,
    verification_method: a.verification_method,
    issuer: a.issuer,
    anchor_id: a.anchor_id,
    revoked: a.revoked,
    revoked_at_ms: a.revoked_at_ms,
    reason: a.reason,
    revocation_ref: a.revocation_ref,
  }));
  const display_name =
    anchors[0]?.display_name ?? anchors[0]?.issuer ?? truncatePubkey(pubkey, 12);
  return {
    pubkey,
    role,
    display_name: display_name.trim() || truncatePubkey(pubkey, 12),
    anchors,
    seen_in_rounds: [],
  };
}

/** Convert PartyEntry to PartyViewModel (rounds_signed, domain_count from entry; domain_count needs entity). */
export function toPartyViewModel(entry: PartyEntry, domainCount = 0): PartyViewModel {
  return {
    pubkey: entry.pubkey,
    role: entry.role,
    agent_id: entry.agent_id,
    display_name: entry.display_name,
    anchors: entry.anchors,
    revoked_any: hasRevokedAnchor(entry.anchors),
    rounds_signed: entry.seen_in_rounds.length,
    domain_count: domainCount,
  };
}

export interface PartiesView {
  /** [Buyer, Provider] — each pubkey appears in only one group; null if no buyer/provider. */
  primary: Array<{ role: 'buyer' | 'provider'; viewModel: PartyViewModel } | null>;
  /** Experts (credential_verified) excluding buyer and provider pubkeys. */
  experts: PartyViewModel[];
  /** Operational agents (non-buyer, non-provider, non-expert). */
  operational: PartyViewModel[];
}

function domainCountForEntry(entry: PartyEntry, snapshot: PassportSnapshotView | null | undefined): number {
  const entity = matchEntity(snapshot ?? null, entry.pubkey);
  return (entity?.domains ?? []).length;
}

/**
 * Build deduped parties view for the Parties section.
 * Each pubkey appears in exactly one group. Priority: BUYER > PROVIDER > EXPERT > AGENT.
 */
export function buildPartiesView(
  index: PartyIndex,
  pack: AuditorPackData,
  boxerSnapshot?: PassportSnapshotView | null
): PartiesView {
  const buyerPk = getBuyerPubkey(pack);
  const providerPk = getProviderOfRecordPubkey(pack);
  const n = (s: string) => norm(s);

  const buyerEntry = buyerPk ? getOrCreateEntry(index, pack, buyerPk, 'buyer', boxerSnapshot) : null;
  const providerEntry = providerPk ? getOrCreateEntry(index, pack, providerPk, 'provider', boxerSnapshot) : null;
  const primary: Array<{ role: 'buyer' | 'provider'; viewModel: PartyViewModel } | null> = [
    buyerEntry
      ? {
          role: 'buyer',
          viewModel: toPartyViewModel(buyerEntry, domainCountForEntry(buyerEntry, boxerSnapshot)),
        }
      : null,
    providerEntry
      ? {
          role: 'provider',
          viewModel: toPartyViewModel(providerEntry, domainCountForEntry(providerEntry, boxerSnapshot)),
        }
      : null,
  ];

  const expertEntries = getExpertParties(index).filter(
    (e) => !(buyerPk && n(e.pubkey) === n(buyerPk)) && !(providerPk && n(e.pubkey) === n(providerPk))
  );
  const experts = expertEntries.map((e) => toPartyViewModel(e, domainCountForEntry(e, boxerSnapshot)));
  const operationalEntries = getOtherAgents(index, pack);
  const operational = operationalEntries.map((e) => toPartyViewModel(e, domainCountForEntry(e, boxerSnapshot)));

  return { primary, experts, operational };
}
