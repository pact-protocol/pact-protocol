import { useState, useCallback } from 'react';

function truncate(s: string, len: number): string {
  return s.length <= len ? s : s.slice(0, len) + '…';
}

interface PartyChipProps {
  pubkey: string;
  label?: string;
  truncateLen?: number;
  /** Short badge labels (e.g. Credential, KYB) shown as pills next to the chip. */
  badges?: string[];
  /** When true, show a revoked-identity warning badge with tooltip. */
  hasRevokedAnchor?: boolean;
  onOpenParty: (pubkey: string) => void;
}

export default function PartyChip({ pubkey, label, truncateLen = 12, badges, hasRevokedAnchor, onOpenParty }: PartyChipProps) {
  const [copied, setCopied] = useState(false);

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

  const displayLabel = label ?? truncate(pubkey, truncateLen);

  return (
    <span className="summary-chip party-chip-wrapper">
      <button
        type="button"
        className="party-chip"
        onClick={() => onOpenParty(pubkey)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenParty(pubkey);
          }
        }}
        aria-label={`Open passport for party ${truncate(pubkey, 16)}`}
        title={pubkey}
      >
        <code>{displayLabel}</code>
      </button>
      {hasRevokedAnchor && (
        <span
          className="party-chip-revoked-badge"
          title="Identity verification revoked after issuance"
          role="img"
          aria-label="Identity verification revoked after issuance"
        >
          ⚠️
        </span>
      )}
      {badges && badges.length > 0 && (
        <span className="party-chip-badges" aria-hidden>
          {badges.map((b) => (
            <span key={b} className="party-chip-badge">
              {b}
            </span>
          ))}
        </span>
      )}
      <button
        type="button"
        className="summary-copy-btn"
        onClick={handleCopy}
        title="Copy pubkey"
        aria-label="Copy pubkey"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  );
}
