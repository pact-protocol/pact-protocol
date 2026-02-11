import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AuditorPackData, PassportSnapshotView } from '../types';
import type { IntegrityVerdict } from '../lib/integrityVerdict';
import { getIntegrityBadgeStyle, getOutcomeBadgeStyle, getResponsibilityBadgeStyle, badgeToneToHistoryClass, getDisplayOutcomeLabel } from '../lib/badgeSemantics';
import {
  matchEntity,
  buildLocalHistoryRows,
  getRolesForPubkey,
  buildRoundsParticipatedIn,
  buildClaimsForParty,
} from '../lib/partyPassport';
import { buildPartyIndex, getPartyByPubkey, getRoleLabel } from '../lib/partyIndex';

interface PartyModalProps {
  isOpen: boolean;
  onClose: () => void;
  pubkey: string;
  loadedPack: AuditorPackData | null;
  boxerSnapshot?: PassportSnapshotView | null;
  integrityVerdict: IntegrityVerdict;
  onOpenTranscript?: (transcriptId: string) => void;
}

const TRANSCRIPT_ID_TRUNCATE_LEN = 20;

function truncate(s: string, len: number): string {
  return s.length <= len ? s : s.slice(0, len) + '…';
}

/** Short timestamp for table display (e.g. "Jan 27, 5:04 PM"); full string in title. */
function formatTimestampShort(iso: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function CopyButton({ text, label = 'Copy', ariaLabel = 'Copy' }: { text: string; label?: string; ariaLabel?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [text]);
  return (
    <button
      type="button"
      className="copy-btn-inline"
      onClick={handleCopy}
      title="Copy"
      aria-label={ariaLabel}
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

/** Anchor type to display label (KYB, Credential, Stripe Verified, Domain, Service Account, OIDC). */
function anchorDisplayType(type: string | undefined, verificationMethod?: string | null): string {
  if (!type) return 'Anchor';
  const t = type.toLowerCase();
  const method = (verificationMethod ?? '').toLowerCase();
  if (t.includes('kyb')) return 'KYB';
  if (t.includes('credential')) return 'Credential';
  if (t.includes('platform') && method === 'stripe') return 'Stripe Verified';
  if (t.includes('domain')) return 'Domain';
  if (t.includes('service_account')) return 'Service Account Verified';
  if (t.includes('oidc')) return 'OIDC Verified';
  if (t.includes('cross') || t.includes('platform')) return 'Cross-platform';
  return type;
}

export default function PartyModal({
  isOpen,
  onClose,
  pubkey,
  loadedPack,
  boxerSnapshot,
  integrityVerdict,
  onOpenTranscript,
}: PartyModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const isUntrusted = integrityVerdict.verdict === 'TAMPERED' || integrityVerdict.verdict === 'INVALID';

  const entity = matchEntity(boxerSnapshot ?? null, pubkey);
  const partyIndex = useMemo(
    () => (loadedPack ? buildPartyIndex(loadedPack, boxerSnapshot ?? null) : new Map()),
    [loadedPack, boxerSnapshot]
  );
  const partyEntry = useMemo(() => getPartyByPubkey(partyIndex, pubkey), [partyIndex, pubkey]);
  const roleLabel = partyEntry ? getRoleLabel(partyEntry.role) : (loadedPack ? getRolesForPubkey(loadedPack, pubkey)[0] : null) ?? 'Unknown';
  const displayName = partyEntry?.display_name;
  const roles = loadedPack ? getRolesForPubkey(loadedPack, pubkey) : [];
  const historyRows = loadedPack ? buildLocalHistoryRows(loadedPack, boxerSnapshot ?? null, pubkey) : [];
  const roundsParticipatedIn = useMemo(
    () => (loadedPack ? buildRoundsParticipatedIn(loadedPack, pubkey) : []),
    [loadedPack, pubkey]
  );
  const claimsForParty = useMemo(
    () => (loadedPack ? buildClaimsForParty(loadedPack, pubkey) : []),
    [loadedPack, pubkey]
  );

  const hasSnapshotAndEntity = Boolean(boxerSnapshot && entity);
  const snapshotVersion =
    boxerSnapshot &&
    [boxerSnapshot.version, boxerSnapshot.scoring_version].filter(Boolean).length > 0
      ? [boxerSnapshot.version, boxerSnapshot.scoring_version].filter(Boolean).join(' · ')
      : null;
  const softwareAttestation = !boxerSnapshot
    ? 'Unversioned (no snapshot loaded)'
    : entity?.software_attestation?.agent_impl_id && entity.software_attestation?.agent_version
      ? `${entity.software_attestation.agent_impl_id}@${entity.software_attestation.agent_version}`
      : entity?.software_attestation?.agent_impl_id
        ? String(entity.software_attestation.agent_impl_id)
        : 'Unversioned (no attestation provided)';

  const firstDomain = entity?.domains?.[0];
  const reliabilityScore = firstDomain?.metrics?.reliability_score;
  const calibrationScore = firstDomain?.metrics?.calibration_score ?? null;

  const anchors = entity?.anchors ?? [];
  const credentialAnchors = anchors.filter((a) => (a.type ?? '').toLowerCase().includes('credential'));
  const stripeAnchors = anchors.filter(
    (a) => (a.type ?? '').toLowerCase().includes('platform') && (a.verification_method ?? '').toLowerCase() === 'stripe'
  );
  const serviceAccountAnchors = anchors.filter((a) => (a.type ?? '').toLowerCase().includes('service_account'));
  const oidcAnchors = anchors.filter((a) => (a.type ?? '').toLowerCase().includes('oidc'));
  const passportTitleSuffix =
    roleLabel === 'Expert' && credentialAnchors.length > 0
      ? 'Expert (Credential Verified)'
      : roleLabel || roles[0] || 'Party';

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !modalRef.current) return;
    const el = modalRef.current;
    const focusables = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    first?.focus();

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    el.addEventListener('keydown', handleTab);
    return () => el.removeEventListener('keydown', handleTab);
  }, [isOpen]);

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const downloadJson = useCallback((filename: string, content: string) => {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="party-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="party-modal-title"
      aria-describedby="party-modal-desc"
      onClick={handleBackdrop}
    >
      <div className="party-modal" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <div className="party-modal-header">
          <h2 id="party-modal-title" className="party-modal-title">
            Passport — <span className="party-modal-title-badge">{passportTitleSuffix}</span>
          </h2>
          <p id="party-modal-desc" className="party-modal-subtitle">
            Party overview, rounds participated, and local history (from loaded pack/snapshot)
          </p>
          <button
            type="button"
            className="party-modal-close"
            onClick={onClose}
            aria-label="Close passport modal"
          >
            ×
          </button>
        </div>

        {isUntrusted && (
          <div className="party-modal-warning" role="alert">
            Evidence integrity failed. Conclusions may be untrusted.
          </div>
        )}
        {anchors.some((a) => a.revoked) && (
          <div className="party-modal-warning party-modal-revoked-warning" role="alert">
            This verification is no longer valid for future transactions.
          </div>
        )}

        <div className="party-modal-body">
          {/* Identity */}
          <section className="party-modal-section" aria-labelledby="party-identity-heading">
            <h3 id="party-identity-heading" className="party-modal-section-title">Identity</h3>
            <div className="party-modal-meta">
              <div className="party-modal-meta-row">
                <span className="party-modal-meta-label">Name</span>
                <span className="party-modal-meta-value">
                  {displayName ?? (entity?.anchors?.[0]?.display_name ?? entity?.anchors?.[0]?.issuer) ?? truncate(pubkey, 16)}
                </span>
              </div>
              <div className="party-modal-meta-row">
                <span className="party-modal-meta-label">Pubkey</span>
                <span className="party-modal-meta-value party-modal-pubkey">
                  <code title={pubkey}>{truncate(pubkey, 28)}</code>
                  <CopyButton text={pubkey} ariaLabel="Copy pubkey" />
                </span>
              </div>
              <div className="party-modal-meta-row">
                <span className="party-modal-meta-label">Entity ID</span>
                <span className="party-modal-meta-value">
                  {!boxerSnapshot ? (
                    <span className="party-modal-muted">Unversioned (no snapshot loaded)</span>
                  ) : entity?.entity_id ? (
                    <>
                      <code title={entity.entity_id}>{truncate(entity.entity_id, 24)}</code>
                      <CopyButton text={entity.entity_id} ariaLabel="Copy entity ID" />
                    </>
                  ) : (
                    <span className="party-modal-muted">Not available (load trust snapshot)</span>
                  )}
                </span>
              </div>
              {snapshotVersion && (
                <div className="party-modal-meta-row">
                  <span className="party-modal-meta-label">Snapshot version</span>
                  <span className="party-modal-meta-value">{snapshotVersion}</span>
                </div>
              )}
              <div className="party-modal-meta-row">
                <span className="party-modal-meta-label">Software attestation</span>
                <span className="party-modal-meta-value">{softwareAttestation}</span>
              </div>
              {(() => {
                const envUrl = (import.meta.env.VITE_ANCHOR_ONBOARDING_URL ?? '').toString().trim();
                const baseUrl = envUrl || (import.meta.env.DEV ? 'http://localhost:5175' : ''); // Production: link hidden unless VITE_ANCHOR_ONBOARDING_URL is set
                if (!baseUrl) return null;
                const onboardingUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}pubkey=${encodeURIComponent(pubkey)}`;
                return (
                  <>
                    {(!boxerSnapshot || anchors.length === 0) && (
                      <p className="party-modal-onboarding-link">
                        This key is not attested. Attestation is set up during onboarding, not after a transaction. To have this key attested, go to{' '}
                        <a href={onboardingUrl} target="_blank" rel="noopener noreferrer" className="party-modal-onboarding-link-a">
                          Anchor onboarding
                        </a>
                        .
                      </p>
                    )}
                  </>
                );
              })()}
              {anchors.length > 0 && (
                <>
                  {anchors.some((a) => a.revoked === true) && (
                    <div className="party-modal-revocation-callout" role="alert">
                      This verification is no longer valid for future transactions.
                    </div>
                  )}
                  <div className="party-modal-meta-row">
                    <span className="party-modal-meta-label">Anchors</span>
                    <span className="party-modal-anchors">
                      {anchors.map((a, i) => (
                        <span
                          key={i}
                          className={`party-modal-anchor-badge ${a.revoked === true ? 'party-modal-anchor-revoked' : ''}`}
                          title={[a.issuer, a.verification_method, a.revoked === true ? 'Revoked' : 'Active'].filter(Boolean).join(' · ') || a.type}
                        >
                          {anchorDisplayType(a.type, a.verification_method) || (a.anchor_id ? truncate(a.anchor_id, 14) : 'Anchor')}
                          <span className="party-modal-anchor-status">{a.revoked === true ? ' · Revoked' : ' · Active'}</span>
                          {(a.verification_method || a.issuer) && (
                            <span className="party-modal-anchor-detail">
                              {[a.verification_method, a.issuer].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </span>
                      ))}
                    </span>
                  </div>
                  {(() => {
                    const envUrl = (import.meta.env.VITE_ANCHOR_ONBOARDING_URL ?? '').toString().trim();
                    const baseUrl = envUrl || (import.meta.env.DEV ? 'http://localhost:5175' : ''); // Production: link hidden unless VITE_ANCHOR_ONBOARDING_URL is set
                    if (!baseUrl) return null;
                    const manageUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}pubkey=${encodeURIComponent(pubkey)}`;
                    return (
                      <p className="party-modal-onboarding-link party-modal-manage-anchors">
                        <a href={manageUrl} target="_blank" rel="noopener noreferrer" className="party-modal-onboarding-link-a">
                          Manage anchors
                        </a>
                      </p>
                    );
                  })()}
                </>
              )}
            </div>
          </section>

          {/* Trust (advisory): only when snapshot loaded; does not affect verification, outcome, responsibility */}
          {boxerSnapshot != null && (
            <section className="party-modal-section party-modal-trust-advisory" aria-labelledby="party-trust-advisory-heading">
              <h3 id="party-trust-advisory-heading" className="party-modal-section-title">Trust (advisory)</h3>
              <p className="party-modal-trust-advisory-disclaimer" role="status">
                Derived signal. Not evidence. May change over time.
              </p>
              {(reliabilityScore != null || calibrationScore != null) ? (
                <div className="party-modal-trust party-modal-trust-bars">
                  {reliabilityScore != null && (
                    <div className="party-modal-trust-item party-modal-trust-bar-row">
                      <span className="party-modal-meta-label">Reliability</span>
                      <div className="party-modal-trust-bar-wrap">
                        <div className="party-modal-trust-bar-track" role="progressbar" aria-valuenow={reliabilityScore <= 1 ? Math.round(reliabilityScore * 100) : Math.min(100, Math.max(0, reliabilityScore))} aria-valuemin={0} aria-valuemax={100}>
                          <div
                            className="party-modal-trust-bar-fill"
                            style={{ width: `${reliabilityScore <= 1 ? Math.min(100, Math.max(0, reliabilityScore * 100)) : Math.min(100, Math.max(0, reliabilityScore))}%` }}
                          />
                        </div>
                        <span className="party-modal-trust-bar-value">
                          {reliabilityScore <= 1 ? `${Math.round(reliabilityScore * 100)}/100` : `${Math.min(100, Math.max(0, reliabilityScore))}/100`}
                        </span>
                      </div>
                    </div>
                  )}
                  {calibrationScore != null && (
                    <div className="party-modal-trust-item party-modal-trust-bar-row">
                      <span className="party-modal-meta-label">Calibration</span>
                      <div className="party-modal-trust-bar-wrap">
                        <div className="party-modal-trust-bar-track" role="progressbar" aria-valuenow={calibrationScore <= 1 ? Math.round(calibrationScore * 100) : Math.min(100, Math.max(0, calibrationScore))} aria-valuemin={0} aria-valuemax={100}>
                          <div
                            className="party-modal-trust-bar-fill"
                            style={{ width: `${calibrationScore <= 1 ? Math.min(100, Math.max(0, calibrationScore * 100)) : Math.min(100, Math.max(0, calibrationScore))}%` }}
                          />
                        </div>
                        <span className="party-modal-trust-bar-value">
                          {calibrationScore <= 1 ? `${Math.round(calibrationScore * 100)}/100` : `${Math.min(100, Math.max(0, calibrationScore))}/100`}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="party-modal-muted">No trust metrics for this entity in the loaded snapshot.</p>
              )}
            </section>
          )}

          {/* Credential (experts): issuer, scope/specialty, payload */}
          {credentialAnchors.length > 0 && (
            <section className="party-modal-section" aria-labelledby="party-credential-heading">
              <h3 id="party-credential-heading" className="party-modal-section-title">Credential</h3>
              <div className="party-modal-meta">
                {credentialAnchors.map((a, i) => (
                  <div key={i} className="party-modal-credential-block">
                    <div className="party-modal-meta-row">
                      <span className="party-modal-meta-label">Status</span>
                      <span className={`party-modal-meta-value ${a.revoked === true ? 'party-modal-anchor-revoked' : ''}`}>
                        {a.revoked === true ? 'Revoked' : 'Active'}
                      </span>
                    </div>
                    {a.revoked === true && a.revoked_at_ms != null && (
                      <div className="party-modal-meta-row">
                        <span className="party-modal-meta-label">Revoked at</span>
                        <span className="party-modal-meta-value">{new Date(Number(a.revoked_at_ms)).toISOString()}</span>
                      </div>
                    )}
{a.revoked === true && a.reason && (
                    <div className="party-modal-meta-row">
                        <span className="party-modal-meta-label">Reason</span>
                        <span className="party-modal-meta-value">{a.reason}</span>
                      </div>
                    )}
                    {a.revoked === true && a.revocation_ref && (
                      <div className="party-modal-meta-row">
                        <span className="party-modal-meta-label">Revocation ref</span>
                        <span className="party-modal-meta-value party-modal-payload-readonly">
                          <code>{a.revocation_ref}</code>
                        </span>
                      </div>
                    )}
                    {a.issuer && (
                      <div className="party-modal-meta-row">
                        <span className="party-modal-meta-label">Issuer (registry)</span>
                        <span className="party-modal-meta-value">{a.issuer}</span>
                      </div>
                    )}
                    {(a.display_name || a.type) && (
                      <div className="party-modal-meta-row">
                        <span className="party-modal-meta-label">Scope / specialty</span>
                        <span className="party-modal-meta-value">{a.display_name?.trim() || a.type || '—'}</span>
                      </div>
                    )}
                    {(a.verification_method || a.type) && (
                      <div className="party-modal-meta-row">
                        <span className="party-modal-meta-label">Credential payload</span>
                        <span className="party-modal-meta-value party-modal-payload-readonly">
                          <code>{a.verification_method?.trim() || a.type || '—'}</code>
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Platform (Stripe): platform, account_type, scope, issuer, issued_at */}
          {stripeAnchors.length > 0 && (
            <section className="party-modal-section" aria-labelledby="party-platform-stripe-heading">
              <h3 id="party-platform-stripe-heading" className="party-modal-section-title">Platform verified (Stripe)</h3>
              <div className="party-modal-meta">
                {stripeAnchors.map((a, i) => {
                  const pl = (a.payload ?? {}) as Record<string, unknown>;
                  const accountType = pl.account_type;
                  const scope = pl.scope;
                  const issuedAt = a.issued_at_ms ?? pl.linked_at_ms;
                  return (
                    <div key={i} className="party-modal-credential-block">
                      <div className="party-modal-meta-row">
                        <span className="party-modal-meta-label">Status</span>
                        <span className={`party-modal-meta-value ${a.revoked === true ? 'party-modal-anchor-revoked' : ''}`}>
                          {a.revoked === true ? 'Revoked' : 'Active'}
                        </span>
                      </div>
                      {a.revoked === true && a.revoked_at_ms != null && (
                        <div className="party-modal-meta-row">
                          <span className="party-modal-meta-label">Revoked at</span>
                          <span className="party-modal-meta-value">{new Date(Number(a.revoked_at_ms)).toISOString()}</span>
                        </div>
                      )}
                      {a.revoked === true && a.reason && (
                        <div className="party-modal-meta-row">
                          <span className="party-modal-meta-label">Reason</span>
                          <span className="party-modal-meta-value">{a.reason}</span>
                        </div>
                      )}
                      {a.revoked === true && a.revocation_ref && (
                        <div className="party-modal-meta-row">
                          <span className="party-modal-meta-label">Revocation ref</span>
                          <span className="party-modal-meta-value party-modal-payload-readonly">
                            <code>{a.revocation_ref}</code>
                          </span>
                        </div>
                      )}
                      <div className="party-modal-meta-row">
                        <span className="party-modal-meta-label">Platform</span>
                        <span className="party-modal-meta-value">Stripe</span>
                      </div>
                      {a.issuer && (
                        <div className="party-modal-meta-row">
                          <span className="party-modal-meta-label">Issuer</span>
                          <span className="party-modal-meta-value">{a.issuer}</span>
                        </div>
                      )}
                      <div className="party-modal-meta-row">
                        <span className="party-modal-meta-label">Account type</span>
                        <span className="party-modal-meta-value">{String(accountType ?? '—')}</span>
                      </div>
                      {(Array.isArray(scope) ? scope.length > 0 : scope != null) && (
                        <div className="party-modal-meta-row">
                          <span className="party-modal-meta-label">Scope</span>
                          <span className="party-modal-meta-value">
                            {Array.isArray(scope) ? scope.join(', ') : String(scope)}
                          </span>
                        </div>
                      )}
                      {issuedAt != null && (
                        <div className="party-modal-meta-row">
                          <span className="party-modal-meta-label">Issued at</span>
                          <span className="party-modal-meta-value">
                            {new Date(Number(issuedAt)).toISOString()}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Service Account Verified */}
          {serviceAccountAnchors.length > 0 && (
            <section className="party-modal-section" aria-labelledby="party-service-account-heading">
              <h3 id="party-service-account-heading" className="party-modal-section-title">Service Account Verified</h3>
              <div className="party-modal-meta">
                {serviceAccountAnchors.map((a, i) => {
                  const pl = (a.payload ?? {}) as Record<string, unknown>;
                  const cloud = pl.cloud;
                  const serviceAccount = pl.service_account;
                  const attestationType = pl.attestation_type;
                  const scope = pl.scope;
                  const issuedAt = a.issued_at_ms;
                  return (
                    <div key={i} className="party-modal-credential-block">
                      <div className="party-modal-meta-row">
                        <span className="party-modal-meta-label">Status</span>
                        <span className={`party-modal-meta-value ${a.revoked === true ? 'party-modal-anchor-revoked' : ''}`}>
                          {a.revoked === true ? 'Revoked' : 'Active'}
                        </span>
                      </div>
                      {a.revoked === true && a.revoked_at_ms != null && (
                        <div className="party-modal-meta-row">
                          <span className="party-modal-meta-label">Revoked at</span>
                          <span className="party-modal-meta-value">{new Date(Number(a.revoked_at_ms)).toISOString()}</span>
                        </div>
                      )}
                      {a.revoked === true && a.reason && (
                        <div className="party-modal-meta-row">
                          <span className="party-modal-meta-label">Reason</span>
                          <span className="party-modal-meta-value">{a.reason}</span>
                        </div>
                      )}
                      {a.revoked === true && a.revocation_ref && (
                        <div className="party-modal-meta-row">
                          <span className="party-modal-meta-label">Revocation ref</span>
                          <span className="party-modal-meta-value party-modal-payload-readonly">
                            <code>{a.revocation_ref}</code>
                          </span>
                        </div>
                      )}
                      <div className="party-modal-meta-row">
                        <span className="party-modal-meta-label">Cloud</span>
                        <span className="party-modal-meta-value">{String(cloud ?? '—')}</span>
                      </div>
                      {serviceAccount && (
                        <div className="party-modal-meta-row">
                          <span className="party-modal-meta-label">Service account</span>
                          <span className="party-modal-meta-value party-modal-payload-readonly">
                            <code>{String(serviceAccount)}</code>
                          </span>
                        </div>
                      )}
                      {attestationType && (
                        <div className="party-modal-meta-row">
                          <span className="party-modal-meta-label">Attestation type</span>
                          <span className="party-modal-meta-value">{String(attestationType)}</span>
                        </div>
                      )}
                      {(Array.isArray(scope) ? scope.length > 0 : scope != null) && (
                        <div className="party-modal-meta-row">
                          <span className="party-modal-meta-label">Scope</span>
                          <span className="party-modal-meta-value">
                            {Array.isArray(scope) ? scope.join(', ') : String(scope)}
                          </span>
                        </div>
                      )}
                      {a.issuer && (
                        <div className="party-modal-meta-row">
                          <span className="party-modal-meta-label">Issuer</span>
                          <span className="party-modal-meta-value">{a.issuer}</span>
                        </div>
                      )}
                      {issuedAt != null && (
                        <div className="party-modal-meta-row">
                          <span className="party-modal-meta-label">Issued at</span>
                          <span className="party-modal-meta-value">
                            {new Date(Number(issuedAt)).toISOString()}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* OIDC Verified */}
          {oidcAnchors.length > 0 && (
            <section className="party-modal-section" aria-labelledby="party-oidc-heading">
              <h3 id="party-oidc-heading" className="party-modal-section-title">OIDC Verified</h3>
              <div className="party-modal-meta">
                {oidcAnchors.map((a, i) => {
                  const pl = (a.payload ?? {}) as Record<string, unknown>;
                  const issuer = pl.issuer;
                  const subject = pl.subject;
                  const tenant = pl.tenant;
                  const email = pl.email;
                  const issuedAt = a.issued_at_ms;
                  return (
                    <div key={i} className="party-modal-credential-block">
                      <div className="party-modal-meta-row">
                        <span className="party-modal-meta-label">Status</span>
                        <span className={`party-modal-meta-value ${a.revoked === true ? 'party-modal-anchor-revoked' : ''}`}>
                          {a.revoked === true ? 'Revoked' : 'Active'}
                        </span>
                      </div>
                      {a.revoked === true && a.revoked_at_ms != null && (
                        <div className="party-modal-meta-row">
                          <span className="party-modal-meta-label">Revoked at</span>
                          <span className="party-modal-meta-value">{new Date(Number(a.revoked_at_ms)).toISOString()}</span>
                        </div>
                      )}
                      {a.revoked === true && a.reason && (
                        <div className="party-modal-meta-row">
                          <span className="party-modal-meta-label">Reason</span>
                          <span className="party-modal-meta-value">{a.reason}</span>
                        </div>
                      )}
                      {a.revoked === true && a.revocation_ref && (
                        <div className="party-modal-meta-row">
                          <span className="party-modal-meta-label">Revocation ref</span>
                          <span className="party-modal-meta-value party-modal-payload-readonly">
                            <code>{a.revocation_ref}</code>
                          </span>
                        </div>
                      )}
                      {issuer && (
                        <div className="party-modal-meta-row">
                          <span className="party-modal-meta-label">Issuer</span>
                          <span className="party-modal-meta-value party-modal-payload-readonly">
                            <code>{String(issuer)}</code>
                          </span>
                        </div>
                      )}
                      {subject && (
                        <div className="party-modal-meta-row">
                          <span className="party-modal-meta-label">Subject</span>
                          <span className="party-modal-meta-value">{String(subject)}</span>
                        </div>
                      )}
                      {tenant != null && (
                        <div className="party-modal-meta-row">
                          <span className="party-modal-meta-label">Tenant</span>
                          <span className="party-modal-meta-value">{String(tenant)}</span>
                        </div>
                      )}
                      {email != null && (
                        <div className="party-modal-meta-row">
                          <span className="party-modal-meta-label">Email</span>
                          <span className="party-modal-meta-value">{String(email)}</span>
                        </div>
                      )}
                      {a.issuer && (
                        <div className="party-modal-meta-row">
                          <span className="party-modal-meta-label">Registry issuer</span>
                          <span className="party-modal-meta-value">{a.issuer}</span>
                        </div>
                      )}
                      {issuedAt != null && (
                        <div className="party-modal-meta-row">
                          <span className="party-modal-meta-label">Issued at</span>
                          <span className="party-modal-meta-value">
                            {new Date(Number(issuedAt)).toISOString()}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Rounds participated in */}
          <section className="party-modal-section" aria-labelledby="party-rounds-heading">
            <h3 id="party-rounds-heading" className="party-modal-section-title">Rounds participated in</h3>
            {roundsParticipatedIn.length === 0 ? (
              <p className="party-modal-muted">No rounds in this transcript for this party.</p>
            ) : (
              <ul className="party-modal-list">
                {roundsParticipatedIn.map((r, i) => (
                  <li key={i}>
                    Round {r.round_number}: {r.round_type}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Claims made */}
          {claimsForParty.length > 0 && (
            <section className="party-modal-section" aria-labelledby="party-claims-heading">
              <h3 id="party-claims-heading" className="party-modal-section-title">Claims made</h3>
              <div className="party-modal-history-table-wrap">
                <table className="party-modal-history-table" aria-label="Claims made by this party">
                  <thead>
                    <tr>
                      <th scope="col">Subject</th>
                      <th scope="col">Value</th>
                      <th scope="col">Confidence</th>
                      {claimsForParty.some((c) => c.claim_type) && <th scope="col">Type</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {claimsForParty.map((c, i) => (
                      <tr key={i}>
                        <td>{c.subject ?? '—'}</td>
                        <td>{c.value ?? '—'}</td>
                        <td>{c.confidence != null ? `${Math.round(c.confidence)}%` : '—'}</td>
                        {claimsForParty.some((x) => x.claim_type) && (
                          <td>{c.claim_type ?? '—'}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Local History (transaction/result for buyer/provider only; experts/agents have none) */}
          <section className="party-modal-section" aria-labelledby="party-history-heading">
            <h3 id="party-history-heading" className="party-modal-section-title">Local History</h3>
            <p className="party-modal-hint">
              Transaction and result for this party in the loaded pack. Shown only for buyer and provider; experts and operational agents do not have transaction rows.
            </p>
            {historyRows.length === 0 ? (
              <p className="party-modal-muted">No transaction/result rows for this party (buyer and provider only).</p>
            ) : (
              <div className="party-modal-history-sections">
                <div className="party-modal-history-section">
                  <h4 className="party-modal-history-subtitle">Transaction</h4>
                  <div className="party-modal-history-table-wrap">
                    <table className="party-modal-history-table" aria-label="Local history — transaction">
                      <thead>
                        <tr>
                          <th scope="col">Purpose</th>
                          <th scope="col">Timestamp</th>
                          <th scope="col">Transcript ID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyRows.map((row, i) => (
                          <tr key={i}>
                            <td className="party-modal-history-cell-purpose">{row.purpose || '—'}</td>
                            <td className="party-modal-history-cell-muted" title={row.timestamp}>{formatTimestampShort(row.timestamp)}</td>
                            <td className="party-modal-history-cell-transcript">
                              <span title={row.transcriptId}>
                                <code className="party-modal-history-transcript-code">{truncate(row.transcriptId, TRANSCRIPT_ID_TRUNCATE_LEN)}</code>
                                <CopyButton text={row.transcriptId} ariaLabel="Copy transcript ID" />
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="party-modal-history-section">
                  <h4 className="party-modal-history-subtitle">Result</h4>
                  <div className="party-modal-history-table-wrap">
                    <table className="party-modal-history-table" aria-label="Local history — result">
                      <thead>
                        <tr>
                          <th scope="col">Outcome</th>
                          <th scope="col">Responsibility</th>
                          <th scope="col">Confidence</th>
                          <th scope="col">Integrity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyRows.map((row, i) => (
                          <tr key={i}>
                        <td>
                          <span className={`party-modal-history-badge ${badgeToneToHistoryClass(getOutcomeBadgeStyle(getDisplayOutcomeLabel(row.integrityVerdictKind, row.status)))}`}>
                            {getDisplayOutcomeLabel(row.integrityVerdictKind, row.status)}
                          </span>
                        </td>
                            <td>
                              <span className={`party-modal-history-badge ${badgeToneToHistoryClass(getResponsibilityBadgeStyle(row.judgment))}`}>
                                {row.judgment}
                              </span>
                            </td>
                            <td className="party-modal-history-cell-muted">
                              {row.confidence > 0 ? `${Math.round(row.confidence)}%` : '—'}
                            </td>
                            <td>
                              <span className={`party-modal-history-badge ${badgeToneToHistoryClass(getIntegrityBadgeStyle(row.integrity))}`}>
                                {row.integrity}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Evidence */}
          <section className="party-modal-section" aria-labelledby="party-evidence-heading">
            <h3 id="party-evidence-heading" className="party-modal-section-title">Evidence</h3>
            <p className="party-modal-hint">Local evidence from the loaded pack.</p>
            <ul className="party-modal-evidence-list">
              <li>
                <button
                  type="button"
                  className="party-modal-link"
                  onClick={() => loadedPack?.transcript && downloadJson('transcript.json', loadedPack.transcript)}
                  disabled={!loadedPack?.transcript}
                  aria-label="Download transcript.json"
                >
                  Download transcript.json
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="party-modal-link"
                  onClick={() => loadedPack?.judgment && downloadJson('judgment.json', JSON.stringify(loadedPack.judgment, null, 2))}
                  disabled={!loadedPack?.judgment}
                  aria-label="Download judgment.json"
                >
                  Download judgment.json
                </button>
              </li>
              {loadedPack?.outcomeEvents != null && (
                <li>
                  <button
                    type="button"
                    className="party-modal-link"
                    onClick={() => loadedPack?.outcomeEvents && downloadJson('outcome_events.json', loadedPack.outcomeEvents!)}
                    aria-label="Download outcome_events.json"
                  >
                    Download outcome_events.json
                  </button>
                </li>
              )}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
