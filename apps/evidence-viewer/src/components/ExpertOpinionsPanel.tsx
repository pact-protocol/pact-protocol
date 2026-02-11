/**
 * Expert Opinions — derived panel for art.acquisition pilot only.
 * Shows expert contributors and their opinion claims from transcript.
 * Derived UI only; not raw evidence.
 */

import type { AuditorPackData, PassportSnapshotView } from '../types';
import { getTransactionPurpose } from '../lib/summaryExtract';
import { buildPartyIndex, getExpertContributors, hasRevokedAnchor } from '../lib/partyIndex';
import PartyChip from './PartyChip';

interface ExpertOpinionsPanelProps {
  packData: AuditorPackData;
  boxerSnapshot?: PassportSnapshotView | null;
  onOpenParty?: (pubkey: string) => void;
}

interface ExpertOpinionClaim {
  pubkey: string;
  display_name: string;
  hasCredential: boolean;
  hasRevokedAnchor?: boolean;
  subject?: string;
  value?: string;
  confidence?: number;
}

function parseExpertOpinionsFromTranscript(pack: AuditorPackData, expertPubkeys: Set<string>): ExpertOpinionClaim[] {
  const out: ExpertOpinionClaim[] = [];
  try {
    const t = pack.transcript ? JSON.parse(pack.transcript) : null;
    const rounds = (t?.rounds ?? []) as Array<{
      agent_id?: string;
      public_key_b58?: string;
      signature?: { signer_public_key_b58?: string };
      content_summary?: { claims?: Array<{ claim_type?: string; subject?: string; value?: string; confidence?: number }> };
    }>;
    const norm = (s: string) => String(s ?? '').trim();
    for (const r of rounds) {
      const pk = r.public_key_b58 ?? r.signature?.signer_public_key_b58;
      if (!pk || !expertPubkeys.has(norm(pk))) continue;
      const claims = r.content_summary?.claims ?? [];
      const expertClaim = claims.find((c) => (c.claim_type ?? '').toLowerCase().includes('expert_opinion'));
      if (expertClaim) {
        out.push({
          pubkey: pk,
          display_name: r.agent_id ?? pk.slice(0, 12) + '…',
          hasCredential: false,
          subject: expertClaim.subject,
          value: expertClaim.value,
          confidence: expertClaim.confidence,
        });
      }
    }
  } catch {
    // ignore
  }
  return out;
}

export default function ExpertOpinionsPanel({ packData, boxerSnapshot, onOpenParty }: ExpertOpinionsPanelProps) {
  const purpose = getTransactionPurpose(packData);
  const isArt = purpose === 'art.acquisition' || (typeof purpose === 'string' && purpose.toLowerCase().includes('art'));

  if (!isArt) return null;

  const partyIndex = buildPartyIndex(packData, boxerSnapshot ?? null);
  const experts = getExpertContributors(partyIndex);
  const expertPubkeys = new Set(experts.map((e) => e.pubkey.trim()));
  const rawClaims = parseExpertOpinionsFromTranscript(packData, expertPubkeys);

  const claimsWithDisplay: ExpertOpinionClaim[] = rawClaims.map((c) => {
    const entry = experts.find((e) => e.pubkey.trim() === c.pubkey.trim());
    return {
      ...c,
      display_name: entry?.display_name ?? c.display_name,
      hasCredential: (entry?.anchors ?? []).some((a) => (a.type ?? '').toLowerCase().includes('credential')),
      hasRevokedAnchor: entry ? hasRevokedAnchor(entry.anchors) : false,
    };
  });

  const valuesBySubject = new Map<string, Set<string>>();
  for (const c of claimsWithDisplay) {
    const sub = c.subject ?? 'default';
    if (!valuesBySubject.has(sub)) valuesBySubject.set(sub, new Set());
    if (c.value) valuesBySubject.get(sub)!.add(c.value);
  }
  const hasDisagreement = Array.from(valuesBySubject.values()).some((s) => s.size > 1);

  if (claimsWithDisplay.length === 0) return null;

  return (
    <section className="expert-opinions-panel" aria-labelledby="expert-opinions-heading">
      <h3 id="expert-opinions-heading" className="expert-opinions-title">
        Expert Opinions
      </h3>
      <p className="expert-opinions-disclaimer">
        Derived from transcript for display only. Not part of raw evidence.
      </p>
      <ul className="expert-opinions-list">
        {claimsWithDisplay.map((claim) => (
          <li key={claim.pubkey} className="expert-opinions-item">
            <span className="expert-opinions-signer">
              {onOpenParty ? (
                <PartyChip
                  pubkey={claim.pubkey}
                  label={claim.display_name}
                  badges={claim.hasCredential ? ['Credential'] : undefined}
                  hasRevokedAnchor={claim.hasRevokedAnchor}
                  onOpenParty={onOpenParty}
                  truncateLen={14}
                />
              ) : (
                <span className="expert-opinions-name">
                  {claim.display_name}
                  {claim.hasCredential && <span className="party-chip-badge">Credential</span>}
                </span>
              )}
            </span>
            {claim.value != null && (
              <span className="expert-opinions-value">{claim.value}</span>
            )}
            {claim.confidence != null && (
              <span className="expert-opinions-confidence">{Math.round(claim.confidence * 100)}% confidence</span>
            )}
          </li>
        ))}
      </ul>
      {hasDisagreement && (
        <p className="expert-opinions-note" role="status">
          Experts expressed different views on the same subject.
        </p>
      )}
    </section>
  );
}
