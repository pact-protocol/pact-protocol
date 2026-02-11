/**
 * Evidence-trust gating for "Money moved" display.
 * Trusted → YES/NO/UNKNOWN from raw value; TAMPERED/INVALID → UNKNOWN + showUntrustedNote.
 */

import { describe, it, expect } from 'vitest';
import {
  getMoneyMovedDisplay,
  isIntegrityUntrusted,
  MONEY_MOVED_UNTRUSTED_NOTE,
  type MoneyMovedDisplayValue,
} from '../moneyMovedDisplay';
import type { IntegrityVerdictKind } from '../integrityVerdict';

describe('moneyMovedDisplay', () => {
  describe('isIntegrityUntrusted', () => {
    it('returns true for TAMPERED and INVALID', () => {
      expect(isIntegrityUntrusted('TAMPERED')).toBe(true);
      expect(isIntegrityUntrusted('INVALID')).toBe(true);
    });
    it('returns false for VERIFIED and INDETERMINATE', () => {
      expect(isIntegrityUntrusted('VERIFIED')).toBe(false);
      expect(isIntegrityUntrusted('INDETERMINATE')).toBe(false);
    });
  });

  describe('getMoneyMovedDisplay', () => {
    const trusted: IntegrityVerdictKind[] = ['VERIFIED', 'INDETERMINATE'];
    const untrusted: IntegrityVerdictKind[] = ['TAMPERED', 'INVALID'];

    describe('when integrity is trusted', () => {
      it('returns YES when raw money_moved is true', () => {
        for (const verdict of trusted) {
          const out = getMoneyMovedDisplay(verdict, true);
          expect(out.value).toBe('YES' as MoneyMovedDisplayValue);
          expect(out.showUntrustedNote).toBe(false);
        }
      });
      it('returns NO when raw money_moved is false', () => {
        for (const verdict of trusted) {
          const out = getMoneyMovedDisplay(verdict, false);
          expect(out.value).toBe('NO' as MoneyMovedDisplayValue);
          expect(out.showUntrustedNote).toBe(false);
        }
      });
      it('returns UNKNOWN when raw money_moved is undefined', () => {
        for (const verdict of trusted) {
          const out = getMoneyMovedDisplay(verdict, undefined);
          expect(out.value).toBe('UNKNOWN' as MoneyMovedDisplayValue);
          expect(out.showUntrustedNote).toBe(false);
        }
      });
    });

    describe('when integrity is tampered or invalid', () => {
      it('returns UNKNOWN and showUntrustedNote true regardless of raw value', () => {
        for (const verdict of untrusted) {
          expect(getMoneyMovedDisplay(verdict, true)).toEqual({
            value: 'UNKNOWN',
            showUntrustedNote: true,
          });
          expect(getMoneyMovedDisplay(verdict, false)).toEqual({
            value: 'UNKNOWN',
            showUntrustedNote: true,
          });
          expect(getMoneyMovedDisplay(verdict, undefined)).toEqual({
            value: 'UNKNOWN',
            showUntrustedNote: true,
          });
        }
      });
    });
  });

  describe('MONEY_MOVED_UNTRUSTED_NOTE', () => {
    it('is the expected inline note for untrusted evidence', () => {
      expect(MONEY_MOVED_UNTRUSTED_NOTE).toBe(
        'Evidence integrity failed; execution fields may be untrusted.'
      );
    });
    it('is used when showUntrustedNote is true from getMoneyMovedDisplay', () => {
      const out = getMoneyMovedDisplay('TAMPERED', true);
      expect(out.showUntrustedNote).toBe(true);
      expect(MONEY_MOVED_UNTRUSTED_NOTE).toBeTruthy();
    });
  });
});
