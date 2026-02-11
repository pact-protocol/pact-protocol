import { useMemo, useState } from 'react';
import type { AuditorPackData, PassportSnapshotView } from '../types';
import {
  buildPartyIndex,
  getExpertContributors,
  getOtherAgents,
  getRoleLabel,
  getAnchorBadgeLabel,
  hasRevokedAnchor,
} from '../lib/partyIndex';
import type { PartyEntry } from '../lib/partyIndex';
import { matchEntity } from '../lib/partyPassport';

interface ContributorsSectionProps {
  packData: AuditorPackData;
  boxerSnapshot?: PassportSnapshotView | null;
  onOpenParty?: (pubkey: string) => void;
}

function partyBadgesWithTitles(
  anchors: Array<{ type?: string; verification_method?: string; issuer?: string; revoked?: boolean }>
): Array<{ label: string; title?: string }> {
  const out: Array<{ label: string; title?: string }> = [];
  const seen = new Set<string>();
  for (const a of anchors) {
    const label = getAnchorBadgeLabel(a.type, a.verification_method);
    if (label && !seen.has(label)) {
      seen.add(label);
      let title: string | undefined;
      if (label === 'Credential' && a.issuer) title = `Credential Verified (issuer: ${a.issuer})`;
      else if (label === 'Stripe Verified') title = 'Stripe Connect identity verified';
      else if (label === 'OIDC Verified') title = 'OIDC identity verified';
      else if (label === 'Service Account Verified') title = 'Service account identity verified';
      else if (label === 'KYB') title = 'Know Your Business verified';
      out.push({ label, title });
    }
  }
  if (hasRevokedAnchor(anchors)) {
    out.push({ label: 'REVOKED', title: 'Identity verification revoked after issuance' });
  }
  return out;
}

/** Expert line: "Display Name — Specialty (Credential Verified)" */
function expertSubtitle(entry: PartyEntry): string {
  const hasCredential = entry.anchors.some((a) => (a.type ?? '').toLowerCase().includes('credential'));
  const specialty = entry.anchors[0]?.display_name ?? entry.anchors[0]?.issuer;
  const parts: string[] = [];
  if (specialty?.trim()) parts.push(specialty.trim());
  if (hasCredential) parts.push('Credential Verified');
  return parts.length ? parts.join(' · ') : 'Expert';
}

function ExpertCard({
  entry,
  boxerSnapshot,
  onOpenParty,
}: {
  entry: PartyEntry;
  boxerSnapshot?: PassportSnapshotView | null;
  onOpenParty?: (pubkey: string) => void;
}) {
  const entity = matchEntity(boxerSnapshot ?? null, entry.pubkey);
  const domains = (entity?.domains ?? []).map((d) => d.domain_id).filter(Boolean) as string[];
  const badges = partyBadgesWithTitles(entry.anchors);
  const roundCount = entry.seen_in_rounds.length;
  const subtitle = expertSubtitle(entry);

  return (
    <div className="contributor-card contributor-card-expert">
      <div className="contributor-card-header">
        <span className="contributor-name">{entry.display_name}</span>
        <span className="contributor-role contributor-role-pill contributor-role-expert">{getRoleLabel(entry.role)}</span>
      </div>
      <p className="contributor-expert-subtitle">{subtitle}</p>
      {badges.length > 0 && (
        <div className="contributor-badges">
          {badges.map((b) => (
            <span key={b.label} className="contributor-badge" title={b.title}>
              {b.label}
            </span>
          ))}
        </div>
      )}
      <div className="contributor-meta">
        <span className="contributor-meta-item">
          <span className="contributor-meta-label">Rounds signed</span>
          <span className="contributor-meta-value">{roundCount}</span>
        </span>
        {domains.length > 0 && (
          <span className="contributor-meta-item">
            <span className="contributor-meta-label">Domains</span>
            <span className="contributor-meta-value" title={domains.join(', ')}>
              {domains.length === 1 ? domains[0] : `${domains.length} domains`}
            </span>
          </span>
        )}
      </div>
      {onOpenParty && (
        <button
          type="button"
          className="contributor-passport-btn"
          onClick={() => onOpenParty(entry.pubkey)}
          aria-label={`Open passport for ${entry.display_name}`}
        >
          View Passport
        </button>
      )}
    </div>
  );
}

function AgentCard({
  entry,
  boxerSnapshot,
  onOpenParty,
}: {
  entry: PartyEntry;
  boxerSnapshot?: PassportSnapshotView | null;
  onOpenParty?: (pubkey: string) => void;
}) {
  const entity = matchEntity(boxerSnapshot ?? null, entry.pubkey);
  const domains = (entity?.domains ?? []).map((d) => d.domain_id).filter(Boolean) as string[];
  const badges = partyBadgesWithTitles(entry.anchors);
  const roundCount = entry.seen_in_rounds.length;

  return (
    <div className="contributor-card">
      <div className="contributor-card-header">
        <span className="contributor-name">{entry.display_name}</span>
        <span className="contributor-role contributor-role-pill">{getRoleLabel(entry.role)}</span>
      </div>
      {badges.length > 0 && (
        <div className="contributor-badges">
          {badges.map((b) => (
            <span key={b.label} className="contributor-badge" title={b.title}>
              {b.label}
            </span>
          ))}
        </div>
      )}
      <div className="contributor-meta">
        <span className="contributor-meta-item">
          <span className="contributor-meta-label">Rounds signed</span>
          <span className="contributor-meta-value">{roundCount}</span>
        </span>
        {domains.length > 0 && (
          <span className="contributor-meta-item">
            <span className="contributor-meta-label">Domains</span>
            <span className="contributor-meta-value" title={domains.join(', ')}>
              {domains.length === 1 ? domains[0] : `${domains.length} domains`}
            </span>
          </span>
        )}
      </div>
      {onOpenParty && (
        <button
          type="button"
          className="contributor-passport-btn"
          onClick={() => onOpenParty(entry.pubkey)}
          aria-label={`Open passport for ${entry.display_name}`}
        >
          View Passport
        </button>
      )}
    </div>
  );
}

export default function ContributorsSection({
  packData,
  boxerSnapshot,
  onOpenParty,
}: ContributorsSectionProps) {
  const [operationalExpanded, setOperationalExpanded] = useState(false);
  const partyIndex = useMemo(
    () => buildPartyIndex(packData, boxerSnapshot ?? null),
    [packData, boxerSnapshot]
  );
  const experts = useMemo(() => getExpertContributors(partyIndex), [partyIndex]);
  const otherAgents = useMemo(() => getOtherAgents(partyIndex, packData), [partyIndex, packData]);

  const hasExperts = experts.length > 0;
  const hasOperational = otherAgents.length > 0;
  if (!hasExperts && !hasOperational) return null;

  return (
    <div className="contributors-section" aria-label="Parties — Experts and operational agents">
      {hasExperts && (
        <>
          <h4 className="contributors-section-title">Experts</h4>
          <div className="contributors-cards contributors-cards-experts">
            {experts.map((entry) => (
              <ExpertCard
                key={entry.pubkey}
                entry={entry}
                boxerSnapshot={boxerSnapshot}
                onOpenParty={onOpenParty}
              />
            ))}
          </div>
        </>
      )}
      {hasOperational && (
        <div className="contributors-operational">
          <h4
            className="contributors-section-title contributors-operational-toggle"
            role="button"
            tabIndex={0}
            onClick={() => setOperationalExpanded((e) => !e)}
            onKeyDown={(e) => e.key === 'Enter' && setOperationalExpanded((prev) => !prev)}
            aria-expanded={operationalExpanded}
            aria-controls="contributors-operational-list"
          >
            Operational Agents ({otherAgents.length})
          </h4>
          <div
            id="contributors-operational-list"
            className="contributors-cards contributors-cards-operational"
            hidden={!operationalExpanded}
          >
            {otherAgents.map((entry) => (
              <AgentCard
                key={entry.pubkey}
                entry={entry}
                boxerSnapshot={boxerSnapshot}
                onOpenParty={onOpenParty}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
