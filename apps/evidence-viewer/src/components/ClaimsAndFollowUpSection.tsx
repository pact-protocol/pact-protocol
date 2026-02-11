import { useState, useCallback, useEffect } from 'react';
import type { AuditorPackData } from '../types';
import { getIntegrityVerdict, getIntegrityVerdictLabel } from '../lib/integrityVerdict';
import { getClaimsEligibilityBanner } from '../lib/claimsFlowState';
import {
  CLAIM_TYPE_OPTIONS,
  isClaimTypeDisabled,
  isClaimTypeWarn,
} from '../lib/claimsClaimTypes';
import { getTranscriptId, getStatus, getJudgment } from '../lib/summaryExtract';
import { getDisplayOutcomeLabel } from '../lib/badgeSemantics';
import AttachmentsDropZone, { type AttachmentEntry } from './AttachmentsDropZone';
import GenerateClaimsPackageButton from './GenerateClaimsPackageButton';

interface ClaimsAndFollowUpSectionProps {
  packData: AuditorPackData;
  attachments: AttachmentEntry[];
  onAttachmentsChange: (a: AttachmentEntry[]) => void;
  onPackageGenerated?: () => void;
}

export default function ClaimsAndFollowUpSection({
  packData,
  attachments,
  onAttachmentsChange,
  onPackageGenerated,
}: ClaimsAndFollowUpSectionProps) {
  const [claimType, setClaimType] = useState<string>('');
  const [claimTypeOther, setClaimTypeOther] = useState('');
  const verdict = getIntegrityVerdict(packData);
  const isTrusted = verdict.verdict === 'VERIFIED';
  const transcriptId = getTranscriptId(packData);
  const rawStatus = getStatus(packData.gcView);
  const displayOutcome = getDisplayOutcomeLabel(verdict.verdict, rawStatus);
  const responsibilityRaw = getJudgment(packData.judgment, packData.gcView) || '—';
  const responsibility = isTrusted ? responsibilityRaw : 'Unavailable (untrusted evidence)';
  const integrityLabel = getIntegrityVerdictLabel(verdict.verdict);

  const banner = getClaimsEligibilityBanner(
    true,
    verdict.verdict,
    displayOutcome,
    isTrusted ? responsibilityRaw : ''
  );

  const handleGenerated = useCallback(() => {
    onPackageGenerated?.();
  }, [onPackageGenerated]);

  const displayClaimTypeLabel =
    claimType === 'other'
      ? claimTypeOther || 'Other'
      : CLAIM_TYPE_OPTIONS.find((o) => o.value === claimType)?.label ?? '';

  const allowedOptions = CLAIM_TYPE_OPTIONS.filter(
    (opt) => !isClaimTypeDisabled(opt, responsibilityRaw)
  );
  const isCurrentSelectionAllowed = allowedOptions.some((o) => o.value === claimType);
  useEffect(() => {
    if (claimType && !isCurrentSelectionAllowed) setClaimType('');
  }, [claimType, isCurrentSelectionAllowed]);
  const selectedOption = CLAIM_TYPE_OPTIONS.find((o) => o.value === claimType);
  const showPaymentDisputeWarning =
    selectedOption &&
    isClaimTypeWarn(selectedOption, responsibilityRaw) &&
    (responsibilityRaw?.toUpperCase().includes('BUYER') ?? false);
  const effectiveClaimType = allowedOptions.some((o) => o.value === claimType) ? claimType : '';

  return (
    <div className="claims-followup-section">
      {/* Eligibility: whether this case can generate a claim and what to expect (payout vs audit-only). */}
      <div className="claims-eligibility-block">
        <h4 className="claims-eligibility-heading">Claim eligibility</h4>
        <p className="claims-eligibility-desc">Whether you can file a claim and what to expect (e.g. payout vs. audit record only).</p>
        <div
          className={`claims-eligibility-banner claims-eligibility-banner-${banner.state}`}
          role="status"
          aria-live="polite"
        >
          {banner.state === 'eligible-strong' && <span className="claims-eligibility-icon" aria-hidden>✅</span>}
          {banner.state === 'eligible-informational' && <span className="claims-eligibility-icon" aria-hidden>⚠️</span>}
          {banner.state === 'blocked' && <span className="claims-eligibility-icon" aria-hidden>❌</span>}
          <span>{banner.message}</span>
        </div>
      </div>

      {/* Read-only claims context: Transcript ID, Outcome, Responsibility, Integrity. Concise, non-editable. */}
      <div className="claims-context">
        <h4 className="claims-context-title">Claims context</h4>
        <dl className="claims-context-grid">
          <dt>Transcript ID</dt>
          <dd>{transcriptId}</dd>
          <dt>Outcome</dt>
          <dd>{displayOutcome}</dd>
          <dt>Responsibility</dt>
          <dd>{responsibility}</dd>
          <dt>Integrity</dt>
          <dd>{integrityLabel}</dd>
        </dl>
      </div>

      {/* Claim type: required when eligible; disabled when not eligible (integrity-first). */}
      <div className="claims-claim-type" aria-disabled={!banner.canGenerate}>
        <label htmlFor="claims-claim-type-select" className="claims-field-label">
          Claim type <span className="claims-required">(required)</span>
        </label>
        <select
          id="claims-claim-type-select"
          className="claims-select"
          value={effectiveClaimType}
          onChange={(e) => setClaimType(e.target.value)}
          aria-required
          disabled={!banner.canGenerate}
        >
          <option value="">Select type…</option>
          {allowedOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {showPaymentDisputeWarning && banner.canGenerate && (
          <p className="claims-claim-type-warn" role="status">
            Buyer at fault — payment dispute claims may be denied. Consider Audit or Policy appeal.
          </p>
        )}
        {claimType === 'other' && (
          <input
            type="text"
            className="claims-input claims-other-input"
            placeholder="Describe (free text)"
            value={claimTypeOther}
            onChange={(e) => setClaimTypeOther(e.target.value)}
            aria-label="Other claim type description"
            disabled={!banner.canGenerate}
          />
        )}
      </div>

      {/* D. Attachments — Supplemental, not part of evidence */}
      <div className="claims-attachments-block">
        <p className="claims-attachments-disclaimer">
          Not part of original evidence. Included only in the Claims Intake Package.
        </p>
        <AttachmentsDropZone attachments={attachments} onAttachmentsChange={onAttachmentsChange} />
      </div>

      {/* Single primary action; disabled with explanation when not eligible */}
      <div className="claims-actions">
        <GenerateClaimsPackageButton
          packData={packData}
          attachments={attachments}
          claimType={claimType === 'other' ? claimTypeOther || 'Other' : displayClaimTypeLabel}
          onGenerated={handleGenerated}
          disabled={!banner.canGenerate}
        />
      </div>
    </div>
  );
}
