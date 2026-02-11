/**
 * Integrity-first eligibility: only VERIFIED can be eligible. Locked banner strings.
 * Covers: Success, Abort 101, Timeout 420, Invalid, Tampered.
 */

import { describe, it, expect } from 'vitest';
import { getClaimsEligibilityBanner, CLAIMS_BANNER } from '../claimsFlowState';

describe('getClaimsEligibilityBanner', () => {
  it('no pack → blocked, canGenerate false', () => {
    const b = getClaimsEligibilityBanner(false, 'VERIFIED', 'COMPLETED', 'NO_FAULT');
    expect(b.state).toBe('blocked');
    expect(b.canGenerate).toBe(false);
    expect(b.message).toBe(CLAIMS_BANNER.NO_PACK);
  });

  describe('untrusted evidence (integrity !== VERIFIED)', () => {
    it('banner never says "Eligible" when integrity is not VERIFIED', () => {
      const verdicts = ['INVALID', 'TAMPERED', 'INDETERMINATE'] as const;
      for (const v of verdicts) {
        const b = getClaimsEligibilityBanner(true, v, 'COMPLETED', 'NO_FAULT');
        expect(b.message).not.toContain('Eligible');
      }
    });

    it('INVALID → not eligible, Verification failed, canGenerate false', () => {
      const b = getClaimsEligibilityBanner(true, 'INVALID', 'COMPLETED', 'NO_FAULT');
      expect(b.state).toBe('blocked');
      expect(b.canGenerate).toBe(false);
      expect(b.message).toBe(CLAIMS_BANNER.UNTRUSTED_VERIFICATION_FAILED);
    });

    it('TAMPERED → not eligible, Tamper detected, canGenerate false', () => {
      const b = getClaimsEligibilityBanner(true, 'TAMPERED', 'ABORTED', 'PROVIDER_AT_FAULT');
      expect(b.state).toBe('blocked');
      expect(b.canGenerate).toBe(false);
      expect(b.message).toBe(CLAIMS_BANNER.UNTRUSTED_TAMPER_DETECTED);
    });

    it('INDETERMINATE → not eligible, Verification failed', () => {
      const b = getClaimsEligibilityBanner(true, 'INDETERMINATE', 'UNKNOWN', '');
      expect(b.canGenerate).toBe(false);
      expect(b.message).toBe(CLAIMS_BANNER.UNTRUSTED_VERIFICATION_FAILED);
    });
  });

  describe('Success (VERIFIED + COMPLETED + NO_FAULT)', () => {
    it('eligible, informational/audit, no payout expected, canGenerate true', () => {
      const b = getClaimsEligibilityBanner(true, 'VERIFIED', 'COMPLETED', 'NO_FAULT');
      expect(b.state).toBe('eligible-informational');
      expect(b.canGenerate).toBe(true);
      expect(b.message).toBe(CLAIMS_BANNER.ELIGIBLE_INFORMATIONAL_NO_PAYOUT);
    });
  });

  describe('Abort 101 (VERIFIED + ABORTED + BUYER_AT_FAULT)', () => {
    it('eligible for review, likely denied, canGenerate true', () => {
      const b = getClaimsEligibilityBanner(true, 'VERIFIED', 'ABORTED', 'BUYER_AT_FAULT');
      expect(b.state).toBe('eligible-informational');
      expect(b.canGenerate).toBe(true);
      expect(b.message).toBe(CLAIMS_BANNER.ELIGIBLE_REVIEW_LIKELY_DENIED);
    });
  });

  describe('Timeout 420 (VERIFIED + TIMEOUT or FAILED)', () => {
    it('TIMEOUT → not eligible, no fault adjudicated, canGenerate false', () => {
      const b = getClaimsEligibilityBanner(true, 'VERIFIED', 'TIMEOUT', 'NO_FAULT');
      expect(b.state).toBe('blocked');
      expect(b.canGenerate).toBe(false);
      expect(b.message).toBe(CLAIMS_BANNER.TIMEOUT_420_NOT_ELIGIBLE);
    });

    it('TIMEOUT + PROVIDER_AT_FAULT → still not eligible (no fault adjudicated)', () => {
      const b = getClaimsEligibilityBanner(true, 'VERIFIED', 'TIMEOUT', 'PROVIDER_AT_FAULT');
      expect(b.state).toBe('blocked');
      expect(b.canGenerate).toBe(false);
      expect(b.message).toBe(CLAIMS_BANNER.TIMEOUT_420_NOT_ELIGIBLE);
    });

    it('FAILED → not eligible, no fault adjudicated', () => {
      const b = getClaimsEligibilityBanner(true, 'VERIFIED', 'FAILED', 'PROVIDER_AT_FAULT');
      expect(b.canGenerate).toBe(false);
      expect(b.message).toBe(CLAIMS_BANNER.TIMEOUT_420_NOT_ELIGIBLE);
    });
  });

  describe('other VERIFIED outcomes', () => {
    it('VERIFIED + ABORTED + PROVIDER_AT_FAULT → eligible for claims review', () => {
      const b = getClaimsEligibilityBanner(true, 'VERIFIED', 'ABORTED', 'PROVIDER_AT_FAULT');
      expect(b.state).toBe('eligible-strong');
      expect(b.canGenerate).toBe(true);
      expect(b.message).toBe(CLAIMS_BANNER.ELIGIBLE_CLAIMS_REVIEW);
    });

    it('VERIFIED + COMPLETED + PROVIDER_AT_FAULT → eligible for claims review', () => {
      const b = getClaimsEligibilityBanner(true, 'VERIFIED', 'COMPLETED', 'PROVIDER_AT_FAULT');
      expect(b.canGenerate).toBe(true);
      expect(b.message).toBe(CLAIMS_BANNER.ELIGIBLE_CLAIMS_REVIEW);
    });
  });
});
