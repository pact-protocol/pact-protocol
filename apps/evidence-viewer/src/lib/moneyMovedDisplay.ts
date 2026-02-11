/**
 * Evidence–trust semantics for "Money moved" and execution fields.
 * When integrity is TAMPERED or INVALID, we must not display YES/NO as fact:
 * the pack may have been altered or failed verification, so execution claims are untrusted.
 */

import type { IntegrityVerdictKind } from './integrityVerdict';

export type MoneyMovedDisplayValue = 'YES' | 'NO' | 'UNKNOWN';

export const MONEY_MOVED_UNTRUSTED_NOTE =
  'Evidence integrity failed; execution fields may be untrusted.';

/**
 * Whether the integrity verdict is untrusted (TAMPERED or INVALID).
 * When true, money moved must not be shown as YES/NO.
 */
export function isIntegrityUntrusted(integrityVerdict: IntegrityVerdictKind): boolean {
  return integrityVerdict === 'TAMPERED' || integrityVerdict === 'INVALID';
}

/**
 * Gating for "Money moved" display. When integrity is TAMPERED or INVALID,
 * we suppress YES/NO and show UNKNOWN so we do not state execution as fact.
 */
export interface MoneyMovedDisplay {
  value: MoneyMovedDisplayValue;
  showUntrustedNote: boolean;
}

export function getMoneyMovedDisplay(
  integrityVerdict: IntegrityVerdictKind,
  rawMoneyMoved: boolean | undefined
): MoneyMovedDisplay {
  const untrusted = isIntegrityUntrusted(integrityVerdict);
  if (untrusted) {
    return { value: 'UNKNOWN', showUntrustedNote: true };
  }
  const value: MoneyMovedDisplayValue =
    rawMoneyMoved === true ? 'YES' : rawMoneyMoved === false ? 'NO' : 'UNKNOWN';
  return { value, showUntrustedNote: false };
}
