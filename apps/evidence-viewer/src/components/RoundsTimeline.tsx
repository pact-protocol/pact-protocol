import { useMemo } from 'react';
import type { AuditorPackData, PassportSnapshotView, ReplayVerifyResultView, PackVerifyResultView } from '../types';
import { buildPartyIndex, getPartyByPubkey, getAnchorBadgeLabel, getRoleLabel, hasRevokedAnchor } from '../lib/partyIndex';
import PartyChip from './PartyChip';

interface RoundsTimelineProps {
  transcriptJson?: string;
  packData?: AuditorPackData | null;
  boxerSnapshot?: PassportSnapshotView | null;
  onOpenParty?: (pubkey: string) => void;
  replayVerifyResult?: ReplayVerifyResultView | null;
  packVerifyResult?: PackVerifyResultView | null;
}

function roundSignerPubkey(r: { public_key_b58?: string; signature?: { signer_public_key_b58?: string } }): string | null {
  return r.public_key_b58 ?? r.signature?.signer_public_key_b58 ?? null;
}

export default function RoundsTimeline({
  transcriptJson,
  packData,
  boxerSnapshot,
  onOpenParty,
  replayVerifyResult,
  packVerifyResult,
}: RoundsTimelineProps) {
  let rounds: Array<{
    round_number?: number;
    round_type?: string;
    agent_id?: string;
    public_key_b58?: string;
    signature?: { signer_public_key_b58?: string };
    round_hash?: string;
  }> = [];
  try {
    const t = transcriptJson ? JSON.parse(transcriptJson) : null;
    rounds = t?.rounds ?? [];
  } catch {
    rounds = [];
  }

  const partyIndex = useMemo(
    () => (packData ? buildPartyIndex(packData, boxerSnapshot ?? null) : new Map()),
    [packData, boxerSnapshot]
  );

  return (
    <div className="rounds-timeline panel" role="region" aria-label="Transcript rounds">
      <h3 className="rounds-timeline-title">Transcript Rounds</h3>
      <p className="rounds-timeline-desc muted">
        Negotiation rounds (who said what, who signed). Not execution steps.
      </p>
      {rounds.length > 0 && (
        <p className="rounds-timeline-total">Total rounds: {rounds.length}</p>
      )}
      {rounds.length > 0 ? (
        <ol className="rounds-list">
          {rounds.map((r, i) => {
            const pubkey = roundSignerPubkey(r);
            const party = pubkey && packData ? getPartyByPubkey(partyIndex, pubkey) : null;
            const displayName = party?.display_name ?? r.agent_id ?? (pubkey ? `${pubkey.slice(0, 12)}…` : '—');
            const badges = party ? party.anchors.map((a) => getAnchorBadgeLabel(a.type, a.verification_method)).filter((b): b is string => b != null) : [];
            const roleLabel = party ? getRoleLabel(party.role) : null;
            const signed = !!(r.signature ?? r.public_key_b58);

            return (
              <li key={i} className="round-item">
                <span className="round-num">Round {r.round_number ?? i + 1}</span>
                <span className="round-type">{r.round_type ?? '—'}</span>
                {roleLabel && (
                  <span className="round-role-badge" title="Party role">
                    {roleLabel}
                  </span>
                )}
                {pubkey ? (
                  onOpenParty ? (
                    <span className="round-signer">
                      <PartyChip
                        pubkey={pubkey}
                        label={displayName}
                        badges={badges.length > 0 ? badges : undefined}
                        hasRevokedAnchor={party ? hasRevokedAnchor(party.anchors) : false}
                        onOpenParty={onOpenParty}
                        truncateLen={14}
                      />
                    </span>
                  ) : (
                    <code className="round-agent" title={pubkey}>
                      {displayName}
                    </code>
                  )
                ) : (
                  r.agent_id && (
                    <code className="round-agent" title={r.agent_id}>
                      {r.agent_id}
                    </code>
                  )
                )}
                {signed && (
                  <span className="round-signed" title="Round signed by this party">Signed ✓</span>
                )}
                <span className="round-hash-status" title={r.round_hash ?? undefined}>
                  {r.round_hash != null && r.round_hash !== '' ? `Hash: ${r.round_hash}` : 'Hash: —'}
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="muted">No transcript rounds</p>
      )}
      {replayVerifyResult?.rounds_verified != null && (
        <p className="rounds-verified">Rounds verified: {replayVerifyResult.rounds_verified}</p>
      )}
      {packVerifyResult && (
        <p className="pack-verify-summary">
          Pack verify: {(packVerifyResult as { ok?: boolean }).ok ? 'OK' : 'Failed'}
        </p>
      )}
    </div>
  );
}
