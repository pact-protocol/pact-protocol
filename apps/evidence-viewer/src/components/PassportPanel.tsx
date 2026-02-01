import type { InsurerSummary, GCView, Judgment, Manifest } from '../types';
import { truncateHash } from '../lib/loadPack';
import './Panel.css';

/** Passport-related fields that may appear in transcript metadata (display only). */
interface TranscriptPassportMeta {
  passport_snapshot?: unknown;
  passport_score?: number;
  passport_tier?: string;
  disputes_lost?: number;
  disputes_won?: number;
  disputes?: number;
  flags?: string[];
  last_updated_ms?: number;
  last_updated?: string;
}

function parseTranscriptMetadata(transcriptJson: string | undefined): TranscriptPassportMeta | null {
  if (!transcriptJson?.trim()) return null;
  try {
    const parsed = JSON.parse(transcriptJson) as { metadata?: Record<string, unknown> };
    const meta = parsed?.metadata;
    if (!meta || typeof meta !== 'object') return null;
    return meta as unknown as TranscriptPassportMeta;
  } catch {
    return null;
  }
}

function formatTimestamp(ms: number | undefined): string | null {
  if (ms == null || typeof ms !== 'number') return null;
  try {
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

interface PassportPanelProps {
  manifest: Manifest;
  transcriptJson?: string;
  gcView: GCView;
  judgment: Judgment;
  insurerSummary: InsurerSummary;
  transcriptId: string;
}

export default function PassportPanel({
  manifest,
  transcriptJson,
  gcView,
  judgment,
  insurerSummary,
  transcriptId: _transcriptId,
}: PassportPanelProps) {
  const transcriptMeta = parseTranscriptMetadata(transcriptJson);
  const { buyer, provider } = insurerSummary;
  const parties = gcView.subject?.parties ?? [];
  const responsibleSigner = gcView.responsibility?.judgment?.responsible_signer_pubkey ?? judgment?.responsible_signer_pubkey;

  // Last updated: manifest > transcript metadata
  const lastUpdatedMs =
    manifest.passport_last_updated_ms ??
    (manifest as { created_at_ms?: number }).created_at_ms ??
    transcriptMeta?.last_updated_ms;
  const lastUpdatedLabel = lastUpdatedMs != null ? formatTimestamp(lastUpdatedMs) : null;

  // Prior disputes/flags: transcript metadata or manifest
  const disputesLost = transcriptMeta?.disputes_lost ?? (manifest as { disputes_lost?: number }).disputes_lost;
  const disputesWon = transcriptMeta?.disputes_won ?? (manifest as { disputes_won?: number }).disputes_won;
  const disputes = transcriptMeta?.disputes ?? (manifest as { disputes?: number }).disputes;
  const flags = transcriptMeta?.flags ?? (manifest as { passport_flags?: string[] }).passport_flags;

  const hasInsurerPassport = !!(buyer || provider);
  const hasParties = parties.length > 0;
  const hasManifestPassport = !!(manifest.passport_snapshot || manifest.passport_last_updated_ms);
  const hasMetaPassport = !!(
    transcriptMeta?.passport_score != null ||
    transcriptMeta?.passport_tier ||
    transcriptMeta?.disputes_lost != null ||
    transcriptMeta?.disputes_won != null ||
    transcriptMeta?.disputes != null ||
    (transcriptMeta?.flags?.length ?? 0) > 0 ||
    transcriptMeta?.last_updated_ms != null
  );
  const hasDisputesOrFlags = disputesLost != null || disputesWon != null || disputes != null || (flags?.length ?? 0) > 0;
  const hasAnyPassport =
    hasInsurerPassport || hasParties || hasManifestPassport || hasMetaPassport || hasDisputesOrFlags || lastUpdatedLabel || responsibleSigner;

  const getTierColor = (tier: string): string => {
    if (tier === 'A') return '#006600';
    if (tier === 'B') return '#CC9900';
    if (tier === 'C') return '#CC0000';
    if (tier === 'D') return '#990000';
    return '#666666';
  };

  const formatScore = (score: number): string => {
    return score >= 0 ? `+${score.toFixed(3)}` : score.toFixed(3);
  };

  if (!hasAnyPassport) {
    return (
      <div className="panel passport-panel">
        <h2 className="panel-title">PASSPORT</h2>
        <div className="panel-content">
          <p className="passport-empty">No passport data in this pack.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel passport-panel">
      <h2 className="panel-title">PASSPORT</h2>
      <div className="panel-content">
        <p className="passport-note">Read-only snapshot from transcript metadata, DBL judgment, and pack manifest. No computation.</p>

        {/* Counterparty identifiers: parties from gc_view.subject */}
        {hasParties && (
          <div className="passport-section">
            <div className="passport-section-title">Counterparties</div>
            {parties.map((p, i) => (
              <div key={i} className="passport-entity">
                <span className="passport-entity-label">{p.role}</span>
                <code className="passport-identifier">{truncateHash(p.signer_pubkey, 16)}</code>
              </div>
            ))}
          </div>
        )}

        {/* Responsible signer from DBL (if fault attributed) */}
        {responsibleSigner && (
          <div className="passport-section">
            <div className="passport-section-title">DBL responsible signer</div>
            <code className="passport-identifier">{truncateHash(responsibleSigner, 16)}</code>
          </div>
        )}

        {/* Score/tier from insurer summary (buyer / provider) */}
        {(buyer || provider) && (
          <div className="passport-section">
            <div className="passport-section-title">Score / tier</div>
            {buyer && (
              <div className="passport-entity">
                <div className="passport-entity-header">
                  <span className="passport-entity-label">Buyer</span>
                  <span
                    className="passport-tier-badge"
                    style={{ borderColor: getTierColor(buyer.tier), color: getTierColor(buyer.tier) }}
                  >
                    Tier {buyer.tier}
                  </span>
                </div>
                <div className="passport-entity-details">
                  <span className="passport-score">Score: {formatScore(buyer.passport_score)}</span>
                </div>
              </div>
            )}
            {provider && (
              <div className="passport-entity">
                <div className="passport-entity-header">
                  <span className="passport-entity-label">Provider</span>
                  <span
                    className="passport-tier-badge"
                    style={{ borderColor: getTierColor(provider.tier), color: getTierColor(provider.tier) }}
                  >
                    Tier {provider.tier}
                  </span>
                </div>
                <div className="passport-entity-details">
                  <span className="passport-score">Score: {formatScore(provider.passport_score)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Score/tier from transcript metadata (if no insurer summary) */}
        {!buyer && !provider && (transcriptMeta?.passport_score != null || transcriptMeta?.passport_tier) && (
          <div className="passport-section">
            <div className="passport-section-title">Score / tier (metadata)</div>
            <div className="passport-entity-details">
              {transcriptMeta.passport_tier && (
                <span
                  className="passport-tier-badge"
                  style={{ borderColor: getTierColor(transcriptMeta.passport_tier), color: getTierColor(transcriptMeta.passport_tier) }}
                >
                  Tier {transcriptMeta.passport_tier}
                </span>
              )}
              {transcriptMeta.passport_score != null && (
                <span className="passport-score">Score: {formatScore(transcriptMeta.passport_score)}</span>
              )}
            </div>
          </div>
        )}

        {/* Prior disputes / flags */}
        {hasDisputesOrFlags && (
          <div className="passport-section">
            <div className="passport-section-title">Prior disputes / flags</div>
            <div className="passport-entity-details">
              {disputesLost != null && <span className="passport-disputes">Disputes lost: {disputesLost}</span>}
              {disputesWon != null && <span className="passport-disputes">Disputes won: {disputesWon}</span>}
              {disputes != null && disputesLost == null && disputesWon == null && (
                <span className="passport-disputes">Disputes: {disputes}</span>
              )}
              {flags && flags.length > 0 && (
                <span className="passport-flags">Flags: {flags.join(', ')}</span>
              )}
            </div>
          </div>
        )}

        {/* Last updated */}
        {lastUpdatedLabel && (
          <div className="passport-section">
            <div className="passport-section-title">Last updated</div>
            <span className="passport-timestamp">{lastUpdatedLabel}</span>
          </div>
        )}

        <div className="passport-registry-note">
          <p className="passport-registry-text">
            Full history: <code className="passport-command-inline">pact-verifier passport-v1-query --signer &lt;pubkey&gt;</code>
          </p>
        </div>
      </div>
    </div>
  );
}
