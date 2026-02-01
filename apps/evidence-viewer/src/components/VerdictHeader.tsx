import type { GCView, Judgment, IntegrityResult, AuditorPackData } from '../types';
import { getIntegrityStatusForPack, displayIntegrityOrFault, INDETERMINATE_TOOLTIP, INDETERMINATE_VERIFY_VIA_CLI } from '../lib/integrity';
import './VerdictHeader.css';

interface VerdictHeaderProps {
  gcView?: GCView | null;
  judgment?: Judgment | null;
  integrityResult?: IntegrityResult | null;
  /** When provided, Integrity uses pack.integrityResult.status; missing => INDETERMINATE + verify-via-CLI hint */
  packData?: AuditorPackData | null;
}

export default function VerdictHeader({ gcView, judgment, integrityResult, packData }: VerdictHeaderProps) {
  const integrityStatus = packData
    ? getIntegrityStatusForPack(packData)
    : (integrityResult?.status ?? 'INDETERMINATE');
  const integrityDisplay = displayIntegrityOrFault(integrityStatus);
  const integrityLabel = `Integrity: ${integrityDisplay}`;
  const hasIntegrityResult = Boolean(packData?.integrityResult ?? integrityResult);
  const integrityTooltip =
    integrityDisplay === 'INDETERMINATE'
      ? hasIntegrityResult
        ? INDETERMINATE_TOOLTIP
        : INDETERMINATE_VERIFY_VIA_CLI
      : undefined;

  const judgmentDisplay =
    judgment?.dblDetermination != null
      ? displayIntegrityOrFault(judgment.dblDetermination)
      : null;
  const judgmentLabel =
    judgmentDisplay != null ? `Judgment: ${judgmentDisplay}` : 'Judgment: unavailable';
  const judgmentTooltip = judgmentDisplay === 'INDETERMINATE' ? INDETERMINATE_TOOLTIP : undefined;

  const confidenceValue =
    judgment?.confidence != null ? judgment.confidence : null;
  const confidenceLabel =
    confidenceValue != null ? `Confidence: ${confidenceValue.toFixed(2)}` : null;

  return (
    <div className="verdict-header">
      <span
        className={`verdict-integrity verdict-${integrityDisplay}`}
        title={integrityTooltip}
      >
        {integrityLabel}
      </span>
      <span className="verdict-sep">|</span>
      <span className="verdict-judgment" title={judgmentTooltip}>
        {judgmentLabel}
      </span>
      <span className="verdict-sep">|</span>
      <span className="verdict-confidence">
        {confidenceLabel ?? 'Confidence: —'}
      </span>
    </div>
  );
}
