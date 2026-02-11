/**
 * Claims Flow eligibility — integrity-first decision model.
 * Eligibility is determined only by evidence integrity. Claims copy must never say "Eligible" when integrity !== VERIFIED.
 *
 * Rules:
 * - integrity !== VERIFIED → not eligible (INVALID / TAMPERED); claim type disabled; Generate disabled.
 * - integrity === VERIFIED → then classify by outcome + responsibility (only these cases may show "Eligible").
 * - COMPLETED + NO_FAULT → Eligible (informational / audit). No payout expected.
 * - ABORTED + BUYER_AT_FAULT → Eligible for review. Likely denied (buyer at fault).
 * - TIMEOUT / FAILED (420) → Not eligible — no fault adjudicated. (canGenerate false.)
 * - Other VERIFIED → Eligible for claims review.
 */

import type { IntegrityVerdictKind } from './integrityVerdict';

export type ClaimsState = 'DISABLED' | 'AVAILABLE' | 'WARN_UNTRUSTED' | 'GENERATED';

/** Display outcome (COMPLETED, ABORTED, TIMEOUT, FAILED, etc.). */
export type ClaimsDisplayOutcome = string;

/** Responsibility (NO_FAULT, BUYER_AT_FAULT, PROVIDER_AT_FAULT, INDETERMINATE, etc.). */
export type ClaimsResponsibility = string;

export type EligibilityTier = 'eligible_strong' | 'eligible_informational' | 'blocked';

export interface ClaimsEligibilityBanner {
  tier: EligibilityTier;
  state: 'eligible-strong' | 'eligible-informational' | 'blocked';
  message: string;
  canGenerate: boolean;
}

/** Locked banner strings — do not change without product approval. */
export const CLAIMS_BANNER = {
  NO_PACK: 'Claims are unavailable because no auditor pack is loaded.',
  UNTRUSTED_VERIFICATION_FAILED: 'Not eligible — evidence untrusted. Verification failed.',
  UNTRUSTED_TAMPER_DETECTED: 'Not eligible — evidence untrusted. Tamper detected.',
  ELIGIBLE_INFORMATIONAL_NO_PAYOUT: 'Eligible (informational / audit). No payout expected.',
  ELIGIBLE_REVIEW_LIKELY_DENIED: 'Eligible for review. Likely denied (buyer at fault).',
  TIMEOUT_420_NOT_ELIGIBLE: 'Not eligible — no fault adjudicated.',
  ELIGIBLE_CLAIMS_REVIEW: 'Eligible for claims review.',
} as const;

function normResp(r: string): string {
  const u = (r ?? '').toUpperCase();
  if (u === 'NO_FAULT' || u === '' || u === 'INDETERMINATE') return u || 'NO_FAULT';
  if (u.includes('BUYER')) return 'BUYER_AT_FAULT';
  if (u.includes('PROVIDER')) return 'PROVIDER_AT_FAULT';
  return u || 'NO_FAULT';
}

function isTimeoutOrFailed(out: string): boolean {
  const u = (out ?? '').toUpperCase();
  return u === 'TIMEOUT' || u === 'FAILED' || u.startsWith('FAILED');
}

/**
 * Derive eligibility banner from integrity first, then outcome + responsibility.
 * Only when integrity === VERIFIED may the banner show "Eligible"; otherwise not eligible.
 */
export function getClaimsEligibilityBanner(
  packLoaded: boolean,
  integrityVerdict: IntegrityVerdictKind,
  displayOutcome: ClaimsDisplayOutcome,
  responsibility: ClaimsResponsibility
): ClaimsEligibilityBanner {
  if (!packLoaded) {
    return {
      tier: 'blocked',
      state: 'blocked',
      message: CLAIMS_BANNER.NO_PACK,
      canGenerate: false,
    };
  }

  if (integrityVerdict !== 'VERIFIED') {
    const message =
      integrityVerdict === 'TAMPERED'
        ? CLAIMS_BANNER.UNTRUSTED_TAMPER_DETECTED
        : CLAIMS_BANNER.UNTRUSTED_VERIFICATION_FAILED;
    return {
      tier: 'blocked',
      state: 'blocked',
      message,
      canGenerate: false,
    };
  }

  const out = (displayOutcome ?? '').toUpperCase();
  const resp = normResp(responsibility ?? '');

  if (out === 'COMPLETED' && (resp === 'NO_FAULT' || resp === 'INDETERMINATE' || !resp)) {
    return {
      tier: 'eligible_informational',
      state: 'eligible-informational',
      message: CLAIMS_BANNER.ELIGIBLE_INFORMATIONAL_NO_PAYOUT,
      canGenerate: true,
    };
  }

  if (out === 'ABORTED' && resp === 'BUYER_AT_FAULT') {
    return {
      tier: 'eligible_informational',
      state: 'eligible-informational',
      message: CLAIMS_BANNER.ELIGIBLE_REVIEW_LIKELY_DENIED,
      canGenerate: true,
    };
  }

  if (isTimeoutOrFailed(out)) {
    return {
      tier: 'blocked',
      state: 'blocked',
      message: CLAIMS_BANNER.TIMEOUT_420_NOT_ELIGIBLE,
      canGenerate: false,
    };
  }

  return {
    tier: 'eligible_strong',
    state: 'eligible-strong',
    message: CLAIMS_BANNER.ELIGIBLE_CLAIMS_REVIEW,
    canGenerate: true,
  };
}

export function getClaimsState(
  packLoaded: boolean,
  integrityVerdict: IntegrityVerdictKind
): Exclude<ClaimsState, 'GENERATED'> {
  if (!packLoaded) return 'DISABLED';
  if (integrityVerdict === 'TAMPERED' || integrityVerdict === 'INVALID') return 'WARN_UNTRUSTED';
  return 'AVAILABLE';
}
