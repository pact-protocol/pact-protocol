import type { AuditorPackData } from '../types';
import { getIntegrityVerdict } from '../lib/integrityVerdict';
import { isIntegrityUntrusted } from '../lib/moneyMovedDisplay';

interface WarningsAndExceptionsPanelProps {
  packData: AuditorPackData;
}

const PROVIDER_UNREACHABLE_INTRO = 'Settlement did not execute because the provider was unreachable.';
const INTEGRITY_FAILED_INTRO = 'Evidence integrity failed, so responsibility/outcome claims are not trustworthy.';

export default function WarningsAndExceptionsPanel({ packData }: WarningsAndExceptionsPanelProps) {
  const packVerify = packData.packVerifyResult as { mismatches?: string[] } | undefined;
  const mismatchWarnings = packVerify?.mismatches ?? packData.integrityResult?.warnings ?? [];
  const gcTakeaways = packData.gcView?.gc_takeaways;
  const why = gcTakeaways?.why ?? [];
  const openQuestions = gcTakeaways?.open_questions ?? [];
  const recommended = gcTakeaways?.recommended_remediation ?? [];

  const status = packData.gcView?.executive_summary?.status;
  const is420 = status === 'FAILED_PROVIDER_UNREACHABLE';
  const integrityVerdict = getIntegrityVerdict(packData).verdict;
  const integrityFailed = isIntegrityUntrusted(integrityVerdict);

  const hasContent =
    is420 ||
    mismatchWarnings.length > 0 ||
    why.length > 0 ||
    openQuestions.length > 0 ||
    recommended.length > 0;

  if (!hasContent) return null;

  return (
    <div className="warnings-panel panel">
      <h3>Warnings &amp; Exceptions</h3>
      {is420 && (
        <div className="warnings-420-intro" role="status">
          <p>{PROVIDER_UNREACHABLE_INTRO}</p>
          {integrityFailed && <p>{INTEGRITY_FAILED_INTRO}</p>}
        </div>
      )}
      {mismatchWarnings.length > 0 && (
        <>
          <p className="warnings-plain-intro" role="status">
            The evidence bundle does not match its signed hash chain.
          </p>
          <ul className="warnings-list">
            {mismatchWarnings.map((w, i) => (
              <li key={i} className="warn">
                {w}
              </li>
            ))}
          </ul>
        </>
      )}
      {why.length > 0 && (
        <div>
          <strong>Why</strong>
          <ul>
            {why.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {openQuestions.length > 0 && (
        <div>
          <strong>Open Questions</strong>
          <ul>
            {openQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}
      {recommended.length > 0 && (
        <div>
          <strong>Recommended Remediation</strong>
          <ul>
            {recommended.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
