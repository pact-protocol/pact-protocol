/**
 * Summary Rendering State Machine.
 * Single enum SummaryState drives header badges, section gating, and field placeholders.
 * No VERIFIED + UNAVAILABLE; untrusted outcome badge is UNTRUSTED.
 */

export enum SummaryState {
  TRUSTED_COMPLETED = 'TRUSTED_COMPLETED',
  TRUSTED_ABORTED = 'TRUSTED_ABORTED',
  TRUSTED_FAILED = 'TRUSTED_FAILED',
  TRUSTED_TIMEOUT = 'TRUSTED_TIMEOUT',
  TRUSTED_UNKNOWN = 'TRUSTED_UNKNOWN',
  INDETERMINATE = 'INDETERMINATE',
  UNTRUSTED_TAMPERED = 'UNTRUSTED_TAMPERED',
  UNTRUSTED_INVALID = 'UNTRUSTED_INVALID',
}

export type ClassifiedOutcome =
  | 'COMPLETED'
  | 'ABORTED'
  | 'FAILED'
  | 'TIMEOUT'
  | 'UNKNOWN';

export interface ClassifyOutcomeInput {
  outcomeCode?: string | null;
  failureCode?: string | null;
  settlementAttempted?: boolean | null;
  moneyMoved?: boolean | null;
}

const ABORT_CODES = new Set(['PACT-101', 'PACT-202', 'PACT-303']);
const TIMEOUT_CODES = new Set(['PACT-404', 'PACT-420']);
const PACT_PREFIX = 'PACT-';

function norm(s: string | undefined | null): string {
  if (s == null || typeof s !== 'string') return '';
  return s.trim().toUpperCase();
}

/**
 * Classify outcome from pack signals. Priority: outcomeCode → failureCode → settlement flags → UNKNOWN.
 */
export function classifyOutcome(input: ClassifyOutcomeInput): ClassifiedOutcome {
  const {
    outcomeCode,
    failureCode,
    settlementAttempted,
    moneyMoved,
  } = input;

  // a) outcomeCode
  const oc = norm(outcomeCode);
  if (oc) {
    if (oc === 'COMPLETED') return 'COMPLETED';
    if (oc.startsWith('ABORT')) return 'ABORTED';
    if (oc.startsWith('FAILED')) {
      if (
        oc.includes('TIMEOUT') ||
        oc.includes('UNREACHABLE') ||
        oc.includes('PROVIDER_UNREACHABLE')
      )
        return 'TIMEOUT';
      return 'FAILED';
    }
  }

  // b) failureCode
  const fc = norm(failureCode);
  if (fc) {
    if (ABORT_CODES.has(fc)) return 'ABORTED';
    if (TIMEOUT_CODES.has(fc)) return 'TIMEOUT';
    if (fc.startsWith(PACT_PREFIX)) return 'FAILED';
  }

  // c) settlement flags
  if (settlementAttempted === false) return 'ABORTED';
  if (settlementAttempted === true && moneyMoved === true) return 'COMPLETED';
  if (settlementAttempted === true && moneyMoved === false) return 'FAILED';

  // d) fallback
  return 'UNKNOWN';
}

export type IntegrityVerdictKind = 'VERIFIED' | 'INVALID' | 'TAMPERED' | 'INDETERMINATE';

export interface DeriveSummaryStateInput extends ClassifyOutcomeInput {
  integrityVerdict: IntegrityVerdictKind;
}

/**
 * Derive single SummaryState from integrity + outcome inputs.
 */
export function deriveSummaryState(input: DeriveSummaryStateInput): SummaryState {
  const { integrityVerdict } = input;

  if (integrityVerdict === 'TAMPERED') return SummaryState.UNTRUSTED_TAMPERED;
  if (integrityVerdict === 'INVALID') return SummaryState.UNTRUSTED_INVALID;
  if (integrityVerdict === 'INDETERMINATE') return SummaryState.INDETERMINATE;

  if (integrityVerdict !== 'VERIFIED') {
    return SummaryState.INDETERMINATE;
  }

  const outcome = classifyOutcome(input);
  switch (outcome) {
    case 'COMPLETED':
      return SummaryState.TRUSTED_COMPLETED;
    case 'ABORTED':
      return SummaryState.TRUSTED_ABORTED;
    case 'FAILED':
      return SummaryState.TRUSTED_FAILED;
    case 'TIMEOUT':
      return SummaryState.TRUSTED_TIMEOUT;
    case 'UNKNOWN':
    default:
      return SummaryState.TRUSTED_UNKNOWN;
  }
}

export type BadgeTone = 'good' | 'warn' | 'bad' | 'muted';

export interface BadgeInfo {
  label: string;
  tone: BadgeTone;
}

/**
 * Integrity badge for Summary header.
 */
export function getIntegrityBadge(state: SummaryState): BadgeInfo {
  switch (state) {
    case SummaryState.TRUSTED_COMPLETED:
    case SummaryState.TRUSTED_ABORTED:
    case SummaryState.TRUSTED_FAILED:
    case SummaryState.TRUSTED_TIMEOUT:
    case SummaryState.TRUSTED_UNKNOWN:
      return { label: 'VERIFIED', tone: 'good' };
    case SummaryState.INDETERMINATE:
      return { label: 'INDETERMINATE', tone: 'warn' };
    case SummaryState.UNTRUSTED_INVALID:
      return { label: 'INVALID', tone: 'bad' };
    case SummaryState.UNTRUSTED_TAMPERED:
      return { label: 'TAMPERED', tone: 'bad' };
    default:
      return { label: 'INDETERMINATE', tone: 'warn' };
  }
}

/**
 * Outcome badge for Summary header.
 * ENFORCEMENT: When integrity !== VERIFIED, outcome is CLAIMED or UNAVAILABLE only (muted).
 */
export function getOutcomeBadge(
  state: SummaryState,
  classifiedOutcome: ClassifiedOutcome
): BadgeInfo {
  switch (state) {
    case SummaryState.TRUSTED_COMPLETED:
      return { label: 'COMPLETED', tone: 'good' };
    case SummaryState.TRUSTED_ABORTED:
      return { label: 'ABORTED', tone: 'warn' };
    case SummaryState.TRUSTED_FAILED:
      return { label: 'FAILED', tone: 'bad' };
    case SummaryState.TRUSTED_TIMEOUT:
      return { label: 'TIMEOUT', tone: 'warn' };
    case SummaryState.TRUSTED_UNKNOWN:
      return { label: 'UNKNOWN', tone: 'muted' };
    case SummaryState.INDETERMINATE:
      return { label: 'UNAVAILABLE', tone: 'muted' };
    case SummaryState.UNTRUSTED_INVALID:
    case SummaryState.UNTRUSTED_TAMPERED:
      return { label: 'CLAIMED', tone: 'muted' };
    default:
      return { label: 'UNAVAILABLE', tone: 'muted' };
  }
}

/** Field display semantics: value vs placeholder */
export type FieldDisplayKind =
  | 'VALUE'
  | 'NOT_RECORDED'
  | 'NOT_APPLICABLE'
  | 'UNTRUSTED'
  | 'UNKNOWN_LEGACY';

export interface FieldDisplayResult {
  kind: FieldDisplayKind;
  /** Display string: value or placeholder text */
  display: string;
}

const NOT_RECORDED = 'Not recorded';
const NOT_APPLICABLE = 'Not applicable';
const UNTRUSTED = 'Untrusted';
const UNKNOWN_LEGACY = 'Unknown (legacy pack)';

/**
 * Resolve how to display a field given state and presence of value.
 * fieldName e.g. "reference" for settlement reference (NOT_APPLICABLE when aborted).
 */
export function getFieldDisplay(
  state: SummaryState,
  fieldName: string,
  value: string | undefined | null
): FieldDisplayResult {
  const hasValue = value != null && String(value).trim() !== '';

  if (
    state === SummaryState.UNTRUSTED_INVALID ||
    state === SummaryState.UNTRUSTED_TAMPERED
  ) {
    return { kind: 'UNTRUSTED', display: UNTRUSTED };
  }

  if (hasValue) {
    return { kind: 'VALUE', display: String(value).trim() };
  }

  if (
    state === SummaryState.TRUSTED_ABORTED &&
    (fieldName === 'reference' || fieldName === 'settlement_reference')
  ) {
    return { kind: 'NOT_APPLICABLE', display: NOT_APPLICABLE };
  }

  return { kind: 'NOT_RECORDED', display: NOT_RECORDED };
}

/** Whether Result/Responsibility/Economic should be blocked (single disclaimer). */
export function isSummaryBlocked(state: SummaryState): boolean {
  return (
    state === SummaryState.UNTRUSTED_INVALID ||
    state === SummaryState.UNTRUSTED_TAMPERED
  );
}

/** Whether to show indeterminate banner. */
export function isIndeterminate(state: SummaryState): boolean {
  return state === SummaryState.INDETERMINATE;
}

/** One-line explanation under Summary header. */
export function getSummaryExplanationLine(
  state: SummaryState,
  classifiedOutcome: ClassifiedOutcome
): string {
  switch (state) {
    case SummaryState.TRUSTED_COMPLETED:
    case SummaryState.TRUSTED_ABORTED:
    case SummaryState.TRUSTED_FAILED:
    case SummaryState.TRUSTED_TIMEOUT:
    case SummaryState.TRUSTED_UNKNOWN:
      return `Evidence verified. Outcome: ${getOutcomeBadge(state, classifiedOutcome).label}.`;
    case SummaryState.INDETERMINATE:
      return `Integrity indeterminate. Outcome: ${classifiedOutcome} (may be incomplete).`;
    case SummaryState.UNTRUSTED_INVALID:
      return 'This pack failed verification. Outcome and responsibility are untrusted.';
    case SummaryState.UNTRUSTED_TAMPERED:
      return 'This pack was altered after signing. Do not rely on outcome or responsibility.';
    default:
      return 'Integrity could not be determined.';
  }
}

/** Canonical explanation: two short paragraphs (what happened, what Pact can/cannot conclude). Non-technical, no filenames. */
export function getCanonicalExplanation(
  state: SummaryState,
  classifiedOutcome: ClassifiedOutcome,
  integrityVerdict: IntegrityVerdictKind
): { paragraph1: string; paragraph2: string } {
  if (integrityVerdict === 'TAMPERED') {
    return {
      paragraph1: 'This evidence bundle was altered after signing.',
      paragraph2: 'Pact can verify individual signatures, but outcomes and responsibility are untrusted.',
    };
  }
  if (integrityVerdict === 'INVALID') {
    return {
      paragraph1: 'This evidence bundle did not pass verification.',
      paragraph2: 'Pact cannot trust the outcome, responsibility, or supporting evidence until verification succeeds.',
    };
  }
  if (state === SummaryState.INDETERMINATE) {
    return {
      paragraph1: 'Integrity could not be fully determined for this bundle.',
      paragraph2: 'Pact may be unable to conclude a definitive outcome or responsibility; review with caution.',
    };
  }
  if (state === SummaryState.TRUSTED_COMPLETED && classifiedOutcome === 'COMPLETED') {
    return {
      paragraph1: 'This transaction completed successfully and all cryptographic integrity checks passed.',
      paragraph2: 'Pact can trust the outcome, responsibility attribution, and supporting evidence.',
    };
  }
  if (state === SummaryState.TRUSTED_ABORTED && classifiedOutcome === 'ABORTED') {
    return {
      paragraph1: 'This transaction was aborted due to a policy violation before settlement.',
      paragraph2: 'Pact can trust the evidence and responsibility attribution, but no funds were transferred.',
    };
  }
  if (state === SummaryState.TRUSTED_TIMEOUT && classifiedOutcome === 'TIMEOUT') {
    return {
      paragraph1: 'The transaction could not complete because the provider was unreachable.',
      paragraph2: 'Pact can verify signed intent and attempts, but no settlement occurred.',
    };
  }
  if (state === SummaryState.TRUSTED_FAILED && classifiedOutcome === 'FAILED') {
    return {
      paragraph1: 'The transaction failed before settlement.',
      paragraph2: 'Pact can trust the evidence and responsibility attribution; no funds were transferred.',
    };
  }
  return {
    paragraph1: 'Evidence integrity checks passed; outcome is as reported.',
    paragraph2: 'Pact can trust the evidence and responsibility attribution for this transaction.',
  };
}
