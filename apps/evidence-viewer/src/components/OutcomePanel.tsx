import type { GCView } from '../types';
import { badgeToneToCssClass, getOutcomeBadgeStyle } from '../lib/badgeSemantics';
import { getMoneyMovedDisplay, MONEY_MOVED_UNTRUSTED_NOTE } from '../lib/moneyMovedDisplay';
import type { IntegrityVerdictKind } from '../lib/integrityVerdict';

interface OutcomePanelProps {
  gcView: GCView;
  integrityVerdict?: IntegrityVerdictKind;
}

/**
 * Map status to explicit plain-English sentence.
 * Aligns with Execution Summary; never contradicts.
 */
function outcomeSentence(status: string | undefined): string {
  if (!status) return 'Outcome unknown.';
  switch (status) {
    case 'COMPLETED':
      return 'Settlement executed.';
    case 'ABORTED_POLICY':
      return 'Settlement aborted by policy.';
    case 'FAILED_PROVIDER_UNREACHABLE':
      return 'Settlement not executed. Provider unreachable.';
    case 'FAILED_TIMEOUT':
      return 'Settlement not executed. Timeout or SLA violation.';
    case 'FAILED_INTEGRITY':
      return 'Settlement not executed. Integrity failure.';
    case 'FAILED_PROVIDER_API_MISMATCH':
      return 'Settlement not executed. Provider API mismatch.';
    case 'DISPUTED':
      return 'Settlement not executed. Disputed.';
    default:
      if (status.startsWith('FAILED')) {
        return 'Settlement not executed.';
      }
      return `Outcome: ${status}.`;
  }
}

export default function OutcomePanel({ gcView, integrityVerdict }: OutcomePanelProps) {
  const es = gcView?.executive_summary;

  const status = es?.status ?? 'UNKNOWN';
  const moneyMovedDisplay = getMoneyMovedDisplay(integrityVerdict ?? 'VERIFIED', es?.money_moved);
  const sentence = outcomeSentence(status);

  return (
    <div className="outcome-panel panel">
      <h3>Outcome</h3>
      <dl className="case-meta outcome-meta">
        <dt>Outcome code</dt>
        <dd>{status}</dd>
        <dt>Summary</dt>
        <dd>{sentence}</dd>
        <dt>Money Moved</dt>
        <dd>
          <span
            className={badgeToneToCssClass(
              moneyMovedDisplay.value === 'YES' ? 'good' : moneyMovedDisplay.value === 'NO' ? 'bad' : 'warn'
            )}
          >
            {moneyMovedDisplay.value}
          </span>
          {moneyMovedDisplay.showUntrustedNote && (
            <p className="outcome-money-moved-untrusted-note" role="status">{MONEY_MOVED_UNTRUSTED_NOTE}</p>
          )}
        </dd>
      </dl>
    </div>
  );
}
