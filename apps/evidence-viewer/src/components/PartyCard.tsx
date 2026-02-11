import { useState, useCallback } from 'react';
import type { PartyViewModel } from '../lib/partyIndex';
import { getRoleLabel, getAnchorBadgeLabel } from '../lib/partyIndex';

interface PartyCardProps {
  viewModel: PartyViewModel;
  onOpenParty?: (pubkey: string) => void;
}

function partyBadgesWithTitles(
  anchors: PartyViewModel['anchors'],
  revokedAny: boolean
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
  if (revokedAny) out.push({ label: 'Revoked', title: 'Identity verification revoked after issuance' });
  return out;
}

export default function PartyCard({ viewModel, onOpenParty }: PartyCardProps) {
  const [copied, setCopied] = useState(false);
  const { pubkey, display_name, role, anchors, revoked_any, rounds_signed, domain_count } = viewModel;
  const badges = partyBadgesWithTitles(anchors, revoked_any);

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(pubkey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // ignore
      }
    },
    [pubkey]
  );

  const roleLabel = getRoleLabel(role);
  const isExpert = role === 'expert';
  const pubkeyDisplay = pubkey.length <= 20 ? pubkey : pubkey.slice(0, 20) + '…';

  return (
    <div className={`contributor-card ${isExpert ? 'contributor-card-expert' : ''}`}>
      <div className="contributor-card-header">
        <span className="contributor-name">{display_name}</span>
        <span
          className={`contributor-role contributor-role-pill ${isExpert ? 'contributor-role-expert' : ''}`}
          aria-label={`Role: ${roleLabel}`}
        >
          {roleLabel}
        </span>
      </div>
      {badges.length > 0 && (
        <div className="contributor-badges">
          {badges.map((b) => (
            <span
              key={b.label}
              className={`contributor-badge ${b.label === 'Revoked' ? 'contributor-badge-revoked' : ''}`}
              title={b.title}
            >
              {b.label}
            </span>
          ))}
        </div>
      )}
      <div className="contributor-meta">
        <span className="contributor-meta-item">
          <span className="contributor-meta-label">Rounds signed</span>
          <span className="contributor-meta-value">{rounds_signed}</span>
        </span>
        {domain_count > 0 && (
          <span className="contributor-meta-item">
            <span className="contributor-meta-label">Domains</span>
            <span className="contributor-meta-value">
              {domain_count === 1 ? '1 domain' : `${domain_count} domains`}
            </span>
          </span>
        )}
      </div>
      <div className="contributor-card-actions">
        <div className="contributor-pubkey-row">
          <code className="contributor-pubkey-value" title={pubkey}>
            {pubkeyDisplay}
          </code>
          <button
            type="button"
            className="contributor-copy-btn"
            onClick={handleCopy}
            title="Copy pubkey"
            aria-label="Copy pubkey"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        {onOpenParty && (
          <button
            type="button"
            className="contributor-passport-btn"
            onClick={() => onOpenParty(pubkey)}
            aria-label={`Open passport for ${display_name}`}
          >
            View Passport
          </button>
        )}
      </div>
    </div>
  );
}
