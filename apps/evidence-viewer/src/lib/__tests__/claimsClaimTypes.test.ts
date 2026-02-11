/**
 * Claim type guardrails by responsibility.
 */

import { describe, it, expect } from 'vitest';
import {
  CLAIM_TYPE_OPTIONS,
  isClaimTypeDisabled,
  isClaimTypeWarn,
  getClaimTypeAccess,
} from '../claimsClaimTypes';

describe('claimsClaimTypes', () => {
  describe('NO_FAULT', () => {
    it('allows Informational, Audit, Regulatory', () => {
      const info = CLAIM_TYPE_OPTIONS.find((o) => o.value === 'informational')!;
      const audit = CLAIM_TYPE_OPTIONS.find((o) => o.value === 'audit')!;
      const reg = CLAIM_TYPE_OPTIONS.find((o) => o.value === 'regulatory')!;
      expect(getClaimTypeAccess(info, 'NO_FAULT')).toBe('allow');
      expect(getClaimTypeAccess(audit, 'NO_FAULT')).toBe('allow');
      expect(getClaimTypeAccess(reg, 'NO_FAULT')).toBe('allow');
    });
    it('disables Payment dispute, Breach', () => {
      const payment = CLAIM_TYPE_OPTIONS.find((o) => o.value === 'payment_dispute')!;
      const breach = CLAIM_TYPE_OPTIONS.find((o) => o.value === 'breach')!;
      expect(isClaimTypeDisabled(payment, 'NO_FAULT')).toBe(true);
      expect(isClaimTypeDisabled(breach, 'NO_FAULT')).toBe(true);
    });
  });

  describe('BUYER_AT_FAULT', () => {
    it('allows Audit, Policy appeal', () => {
      const audit = CLAIM_TYPE_OPTIONS.find((o) => o.value === 'audit')!;
      const policy = CLAIM_TYPE_OPTIONS.find((o) => o.value === 'policy_appeal')!;
      expect(getClaimTypeAccess(audit, 'BUYER_AT_FAULT')).toBe('allow');
      expect(getClaimTypeAccess(policy, 'BUYER_AT_FAULT')).toBe('allow');
    });
    it('warns on Payment dispute', () => {
      const payment = CLAIM_TYPE_OPTIONS.find((o) => o.value === 'payment_dispute')!;
      expect(isClaimTypeWarn(payment, 'BUYER_AT_FAULT')).toBe(true);
      expect(isClaimTypeDisabled(payment, 'BUYER_AT_FAULT')).toBe(false);
    });
    it('disables Breach', () => {
      const breach = CLAIM_TYPE_OPTIONS.find((o) => o.value === 'breach')!;
      expect(isClaimTypeDisabled(breach, 'BUYER_AT_FAULT')).toBe(true);
    });
  });

  describe('PROVIDER_AT_FAULT', () => {
    it('allows all claim types', () => {
      for (const opt of CLAIM_TYPE_OPTIONS) {
        expect(getClaimTypeAccess(opt, 'PROVIDER_AT_FAULT')).toBe('allow');
        expect(isClaimTypeDisabled(opt, 'PROVIDER_AT_FAULT')).toBe(false);
      }
    });
  });
});
