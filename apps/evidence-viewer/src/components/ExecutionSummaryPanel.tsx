import type { GCView } from '../types';
import { badgeToneToCssClass, getOutcomeBadgeStyle } from '../lib/badgeSemantics';
import { getMoneyMovedDisplay, MONEY_MOVED_UNTRUSTED_NOTE } from '../lib/moneyMovedDisplay';
import type { IntegrityVerdictKind } from '../lib/integrityVerdict';

interface ExecutionSummaryPanelProps {
  gcView: GCView;
  integrityVerdict?: IntegrityVerdictKind;
  transcriptJson?: string;
  replayVerifyResult?: { errors?: Array<{ round_number?: number; message?: string }> } | null;
}

const ROUND_TYPE_TO_STEP: Record<string, string> = {
  INTENT: 'Quote requested',
  BID: 'Quote provided',
  COUNTER: 'Counter offer',
  ACCEPT: 'Accept',
  REJECT: 'Reject',
  ABORT: 'Abort',
};

/** ASK step label by agent_id and/or claim_type (Art pilot: gallery offer, expert_opinion, imaging). */
function askStepLabel(round: { agent_id?: string; content_summary?: { claims?: Array<{ claim_type?: string; agent?: string }> } }): string {
  const agentId = (round.agent_id ?? '').toLowerCase();
  const claims = round.content_summary?.claims ?? [];
  const hasExpertOpinion = claims.some((c) => (c.claim_type ?? '').toLowerCase().includes('expert_opinion'));
  const hasImaging = claims.some((c) => (c.agent ?? '').toLowerCase().includes('imaging')) || agentId.includes('imaging');
  if (agentId === 'gallery') return 'Offer / quote received';
  if (hasExpertOpinion || agentId === 'expert_a' || agentId === 'expert_b') return 'Expert opinion received';
  if (hasImaging || agentId === 'imaging_v2') return 'Imaging analysis received';
  return 'Attestation received';
}

function stepName(event: string, round?: { agent_id?: string; content_summary?: { claims?: Array<{ claim_type?: string; agent?: string }> } }): string {
  if (event === 'ASK' && round) return askStepLabel(round);
  return ROUND_TYPE_TO_STEP[event] ?? event;
}

function settlementStatusFromPack(
  status: string | undefined,
  settlementAttempted: boolean | undefined
): 'COMPLETED' | 'ABORTED' | 'FAILED' | 'NOT_ATTEMPTED' | null {
  if (settlementAttempted === false) return 'NOT_ATTEMPTED';
  if (!status) return null;
  if (status === 'COMPLETED') return 'COMPLETED';
  if (status === 'ABORTED_POLICY') return 'ABORTED';
  if (status.startsWith('FAILED')) return 'FAILED';
  return null;
}

export default function ExecutionSummaryPanel({
  gcView,
  integrityVerdict,
  transcriptJson,
  replayVerifyResult,
}: ExecutionSummaryPanelProps) {
  const es = gcView?.executive_summary;

  const moneyMovedDisplay = getMoneyMovedDisplay(integrityVerdict ?? 'VERIFIED', es?.money_moved);
  const moneyMovedLabel = moneyMovedDisplay.value;
  const settlementAttempted = es?.settlement_attempted;
  const settlementAttemptedLabel =
    settlementAttempted === true ? 'YES' : settlementAttempted === false ? 'NO' : '—';

  const settlementStatus = settlementStatusFromPack(es?.status, settlementAttempted);

  // Steps from gc_view.timeline or transcript rounds
  const gcTimeline = (gcView as { timeline?: Array<{ event: string; round?: number }> }).timeline;
  let steps: Array<{ step: string; event: string; round?: number }> = [];

  if (gcTimeline?.length) {
    steps = gcTimeline.map((t) => ({
      step: stepName(t.event),
      event: t.event,
      round: t.round,
    }));
  } else if (transcriptJson) {
    try {
      const t = JSON.parse(transcriptJson);
      const rounds = (t?.rounds ?? []) as Array<{
        round_type?: string;
        round_number?: number;
        agent_id?: string;
        content_summary?: { claims?: Array<{ claim_type?: string; agent?: string }> };
      }>;
      steps = rounds.map((r) => ({
        step: stepName(r.round_type ?? '', r),
        event: r.round_type ?? '',
        round: r.round_number,
      }));
    } catch {
      steps = [];
    }
  }

  const roundErrors = new Map(
    (replayVerifyResult?.errors ?? []).map((e) => [e.round_number, e.message])
  );

  function stepResult(round?: number): 'SUCCESS' | 'FAILED' | 'SKIPPED' {
    if (round != null && roundErrors.has(round)) return 'FAILED';
    return 'SUCCESS';
  }

  const stepsWithResult = steps.map((s) => ({
    ...s,
    result: stepResult(s.round),
    reason: s.round != null ? roundErrors.get(s.round) : undefined,
  }));

  // Add Settlement attempt row when settlement was attempted
  if (settlementAttempted && settlementStatus) {
    stepsWithResult.push({
      step: 'Settlement attempt',
      event: 'SETTLEMENT',
      round: undefined,
      result: settlementStatus === 'COMPLETED' ? 'SUCCESS' : 'FAILED',
      reason:
        settlementStatus === 'ABORTED'
          ? 'Policy aborted'
          : settlementStatus === 'FAILED'
          ? es?.status ?? undefined
          : undefined,
    });
  }

  const moneyMovedClass = badgeToneToCssClass(
    moneyMovedLabel === 'YES' ? 'good' : moneyMovedLabel === 'NO' ? 'bad' : 'warn'
  );
  const settlementClass =
    settlementAttemptedLabel === 'YES'
      ? badgeToneToCssClass('good')
      : settlementAttemptedLabel === 'NO'
      ? badgeToneToCssClass('bad')
      : '';

  return (
    <div className="execution-summary-panel panel">
      <h3>Execution Summary</h3>

      <div className="execution-summary-top">
        <div className="execution-summary-row">
          <span className="execution-summary-label">Money Moved:</span>
          <span className={`execution-summary-value ${moneyMovedClass}`}>{moneyMovedLabel}</span>
          {moneyMovedDisplay.showUntrustedNote && (
            <p className="execution-money-moved-untrusted-note" role="status">{MONEY_MOVED_UNTRUSTED_NOTE}</p>
          )}
        </div>
        <div className="execution-summary-row">
          <span className="execution-summary-label">Settlement Attempted:</span>
          <span className={`execution-summary-value ${settlementClass}`}>
            {settlementAttemptedLabel}
          </span>
        </div>
        {settlementStatus && settlementAttempted && (
          <div className="execution-summary-row">
            <span className="execution-summary-label">Settlement Status:</span>
            <span
              className={`execution-summary-value ${badgeToneToCssClass(
                getOutcomeBadgeStyle(settlementStatus ?? '')
              )}`}
            >
              {settlementStatus}
            </span>
          </div>
        )}
      </div>

      {stepsWithResult.length > 0 ? (
        <div className="execution-summary-steps">
          <table className="execution-summary-table">
            <thead>
              <tr>
                <th>Step</th>
                <th>Result</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {stepsWithResult.map((row, i) => (
                <tr key={i}>
                  <td>{row.step || '—'}</td>
                  <td>
                    <span
                      className={badgeToneToCssClass(
                        row.result === 'SUCCESS' ? 'good' : row.result === 'FAILED' ? 'bad' : 'warn'
                      )}
                    >
                      {row.result}
                    </span>
                  </td>
                  <td className="execution-summary-reason">{row.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="execution-summary-empty">No execution steps in this pack.</p>
      )}
    </div>
  );
}
