/**
 * Claim type options and guardrails by responsibility.
 * Prevents users from generating nonsense claim packages.
 *
 * NO_FAULT: Allow Informational, Audit, Regulatory, Other. Disable Policy appeal, Payment dispute, Breach.
 * BUYER_AT_FAULT: Allow Audit, Policy appeal, Regulatory, Other. Disable Payment dispute, Breach.
 * PROVIDER_AT_FAULT: Allow everything.
 */

export type ResponsibilityKind = 'NO_FAULT' | 'BUYER_AT_FAULT' | 'PROVIDER_AT_FAULT' | string;

export interface ClaimTypeOption {
  value: string;
  label: string;
  /** When responsibility matches, 'allow' | 'disallow' | 'warn' (warn = allow but show warning) */
  whenNoFault: 'allow' | 'disallow';
  whenBuyerAtFault: 'allow' | 'disallow' | 'warn';
  whenProviderAtFault: 'allow';
}

export const CLAIM_TYPE_OPTIONS: ClaimTypeOption[] = [
  { value: 'informational', label: 'Informational', whenNoFault: 'allow', whenBuyerAtFault: 'disallow', whenProviderAtFault: 'allow' },
  { value: 'audit', label: 'Audit', whenNoFault: 'allow', whenBuyerAtFault: 'allow', whenProviderAtFault: 'allow' },
  { value: 'regulatory', label: 'Regulatory', whenNoFault: 'allow', whenBuyerAtFault: 'allow', whenProviderAtFault: 'allow' },
  { value: 'policy_appeal', label: 'Policy appeal', whenNoFault: 'disallow', whenBuyerAtFault: 'allow', whenProviderAtFault: 'allow' },
  { value: 'payment_dispute', label: 'Payment dispute', whenNoFault: 'disallow', whenBuyerAtFault: 'warn', whenProviderAtFault: 'allow' },
  { value: 'breach', label: 'Breach', whenNoFault: 'disallow', whenBuyerAtFault: 'disallow', whenProviderAtFault: 'allow' },
  { value: 'other', label: 'Other', whenNoFault: 'allow', whenBuyerAtFault: 'allow', whenProviderAtFault: 'allow' },
];

function normResponsibility(r: string): ResponsibilityKind {
  const u = (r ?? '').toUpperCase();
  if (u === 'NO_FAULT' || u === '') return 'NO_FAULT';
  if (u.includes('BUYER')) return 'BUYER_AT_FAULT';
  if (u.includes('PROVIDER')) return 'PROVIDER_AT_FAULT';
  return u || 'NO_FAULT';
}

export function getClaimTypeAccess(
  option: ClaimTypeOption,
  responsibility: ResponsibilityKind
): 'allow' | 'disallow' | 'warn' {
  const r = normResponsibility(responsibility);
  if (r === 'PROVIDER_AT_FAULT') return option.whenProviderAtFault;
  if (r === 'BUYER_AT_FAULT') return option.whenBuyerAtFault;
  return option.whenNoFault;
}

export function isClaimTypeDisabled(
  option: ClaimTypeOption,
  responsibility: ResponsibilityKind
): boolean {
  return getClaimTypeAccess(option, responsibility) === 'disallow';
}

export function isClaimTypeWarn(
  option: ClaimTypeOption,
  responsibility: ResponsibilityKind
): boolean {
  return getClaimTypeAccess(option, responsibility) === 'warn';
}
