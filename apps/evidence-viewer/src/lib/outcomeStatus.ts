/**
 * Canonical outcome status for Summary header.
 * Strict separation: Integrity (trust) vs Outcome (business result).
 * When integrity VERIFIED: COMPLETED | ABORTED | FAILED | TIMEOUT | UNKNOWN.
 * When integrity NOT VERIFIED: CLAIMED (untrusted). No UNAVAILABLE in badges.
 */

import type { AuditorPackData, GCView, Judgment } from '../types';
import type { IntegrityVerdictKind } from './integrityVerdict';

export type OutcomeBadge =
  | 'COMPLETED'
  | 'ABORTED'
  | 'FAILED'
  | 'TIMEOUT'
  | 'UNKNOWN'
  | 'CLAIMED';

export interface DeriveOutcomeStatusResult {
  badge: OutcomeBadge;
  reason: string;
  debugWhy?: string;
}

/** Abort-style failure codes (policy, KYA, deadlock) → ABORTED */
const ABORT_CODES = new Set(['PACT-101', 'PACT-202', 'PACT-303']);
/** Timeout / provider unreachable → TIMEOUT (valid outcome when VERIFIED) */
const TIMEOUT_CODES = new Set(['PACT-420', 'PACT-404']);
const FAILED_CODE_PREFIX = 'PACT-';

function norm(s: string | undefined): string {
  if (s == null || typeof s !== 'string') return '';
  return s.trim().toUpperCase();
}

function fromPackOutcome(gcView: GCView | undefined): OutcomeBadge | null {
  const code =
    gcView?.executive_summary?.final_outcome ?? gcView?.executive_summary?.status;
  const c = norm(code);
  if (!c) return null;
  if (c === 'COMPLETED') return 'COMPLETED';
  if (c.startsWith('ABORT')) return 'ABORTED';
  if (c.startsWith('FAILED')) {
    if (c.includes('TIMEOUT') || c.includes('UNREACHABLE') || c.includes('PROVIDER_UNREACHABLE')) return 'TIMEOUT';
    return 'FAILED';
  }
  return null;
}

function fromJudgmentOrTranscript(
  judgment: Judgment | undefined,
  transcriptJson: string | undefined
): OutcomeBadge | null {
  const judgmentAny = judgment as { failureCode?: string; code?: string; status?: string };
  const failureCode =
    judgmentAny?.failureCode ?? judgmentAny?.code ?? failureCodeFromTranscript(transcriptJson);
  if (!failureCode || typeof failureCode !== 'string') {
    const status = norm(judgmentAny?.status);
    if (status === 'FAILED') return 'FAILED';
    if (status === 'ABORTED') return 'ABORTED';
    return null;
  }
  const code = failureCode.trim().toUpperCase();
  if (ABORT_CODES.has(code)) return 'ABORTED';
  if (TIMEOUT_CODES.has(code)) return 'TIMEOUT';
  if (code.startsWith(FAILED_CODE_PREFIX)) return 'FAILED';
  return null;
}

function failureCodeFromTranscript(transcriptJson: string | undefined): string | undefined {
  if (!transcriptJson) return undefined;
  try {
    const t = JSON.parse(transcriptJson) as { failure_event?: { code?: string } };
    return t?.failure_event?.code;
  } catch {
    return undefined;
  }
}

function fromSettlementFlags(
  settlementAttempted: boolean | undefined,
  moneyMoved: boolean | undefined
): OutcomeBadge | null {
  if (settlementAttempted === false) return 'ABORTED';
  if (settlementAttempted === true && moneyMoved === false) return 'FAILED';
  if (settlementAttempted === true && moneyMoved === true) return 'COMPLETED';
  return null;
}

/**
 * Derive canonical outcome for Summary header.
 * If integrity !== VERIFIED: always CLAIMED (untrusted). Never UNAVAILABLE.
 * If VERIFIED: failureCode → pack outcome → settlement flags → UNKNOWN.
 */
export function deriveOutcomeStatus(
  integrityVerdict: IntegrityVerdictKind,
  pack: AuditorPackData
): DeriveOutcomeStatusResult {
  if (integrityVerdict !== 'VERIFIED') {
    const reason =
      integrityVerdict === 'TAMPERED'
        ? 'Evidence was altered after signing. Outcome shown is claimed only.'
        : integrityVerdict === 'INVALID'
          ? 'Verification failed. Outcome shown is claimed only.'
          : 'Integrity could not be determined. Outcome shown is claimed only.';
    return {
      badge: 'CLAIMED',
      reason,
      debugWhy: 'integrity not VERIFIED',
    };
  }

  const es = pack.gcView?.executive_summary;
  const settlementAttempted = es?.settlement_attempted;
  const moneyMoved = es?.money_moved;

  const fromB = fromJudgmentOrTranscript(pack.judgment, pack.transcript);
  if (fromB) return { badge: fromB, reason: 'From judgment or failure event.' };

  const fromA = fromPackOutcome(pack.gcView);
  if (fromA) return { badge: fromA, reason: 'From pack outcome.' };

  const fromC = fromSettlementFlags(settlementAttempted, moneyMoved);
  if (fromC) return { badge: fromC, reason: 'From settlement flags.' };

  return {
    badge: 'UNKNOWN',
    reason: 'Outcome not recorded in this pack.',
    debugWhy: 'no outcome signals found',
  };
}
