/**
 * Global badge legend — single source of truth for the entire app.
 * Two independent axes: Evidence Integrity (authoritative) and Outcome State.
 * Enforcement: When Integrity !== VERIFIED, outcome display is CLAIMED or UNAVAILABLE only.
 */

export type BadgeTone = 'good' | 'warn' | 'bad' | 'muted';

/** Normalized integrity verdict for badge lookup */
export type IntegrityVerdict = 'VERIFIED' | 'INVALID' | 'TAMPERED' | 'INDETERMINATE';

/** Display outcome label (enforcement: CLAIMED/UNAVAILABLE when integrity !== VERIFIED) */
export type DisplayOutcome =
  | 'COMPLETED'
  | 'ABORTED'
  | 'TIMEOUT'
  | 'FAILED'
  | 'CLAIMED'
  | 'UNAVAILABLE'
  | 'UNKNOWN';

/** Map tone to standard status CSS class */
export function badgeToneToCssClass(tone: BadgeTone): string {
  switch (tone) {
    case 'good': return 'status-good';
    case 'warn': return 'status-warn';
    case 'bad': return 'status-bad';
    case 'muted': return 'status-muted';
    default: return 'status-warn';
  }
}

/** Map tone to Passport Local History card badge class */
export function badgeToneToHistoryClass(tone: BadgeTone): string {
  switch (tone) {
    case 'good': return 'history-badge-good';
    case 'warn': return 'history-badge-warn';
    case 'bad': return 'history-badge-bad';
    case 'muted': return 'history-badge-muted';
    default: return 'history-badge-muted';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AXIS 1: Evidence Integrity (absolute, authoritative; always evaluated first)
// ─────────────────────────────────────────────────────────────────────────────

function normVerdict(verdict: string): IntegrityVerdict {
  const v = (verdict ?? '').toUpperCase();
  if (v === 'VERIFIED') return 'VERIFIED';
  if (v === 'INVALID') return 'INVALID';
  if (v === 'TAMPERED') return 'TAMPERED';
  if (v === 'INDETERMINATE') return 'INDETERMINATE';
  return 'INDETERMINATE';
}

/** Integrity badge style: VERIFIED=green, INVALID=red, TAMPERED=red strong, INDETERMINATE=warn */
export function getIntegrityBadgeStyle(verdict: string): BadgeTone {
  const v = normVerdict(verdict);
  if (v === 'VERIFIED') return 'good';
  if (v === 'INDETERMINATE') return 'warn';
  return 'bad';
}

/** Extra class for TAMPERED (stronger red / alert) */
export function getIntegrityBadgeModifier(verdict: string): 'tampered' | null {
  return normVerdict(verdict) === 'TAMPERED' ? 'tampered' : null;
}

/** Icon for integrity: check (VERIFIED), x (INVALID), stop (TAMPERED), warn (INDETERMINATE) */
export function getIntegrityBadgeIcon(verdict: string): 'check' | 'x' | 'stop' | 'warn' {
  const v = normVerdict(verdict);
  if (v === 'VERIFIED') return 'check';
  if (v === 'INVALID') return 'x';
  if (v === 'TAMPERED') return 'stop';
  return 'warn';
}

export function isIntegrityVerified(verdict: string): boolean {
  return normVerdict(verdict) === 'VERIFIED';
}

export function isIntegrityTampered(verdict: string): boolean {
  return normVerdict(verdict) === 'TAMPERED';
}

// ─────────────────────────────────────────────────────────────────────────────
// AXIS 2: Outcome State (COMPLETED=green, ABORTED/TIMEOUT=yellow, CLAIMED/UNAVAILABLE=gray)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ENFORCEMENT: When integrity !== VERIFIED, outcome must be CLAIMED or UNAVAILABLE.
 * Returns the display outcome label to show (never COMPLETED/ABORTED/TIMEOUT when evidence is invalid).
 */
export function getDisplayOutcomeLabel(
  integrityVerdict: string,
  rawOutcome: string
): DisplayOutcome {
  const v = normVerdict(integrityVerdict);
  if (v === 'VERIFIED') {
    const o = (rawOutcome ?? '').toUpperCase();
    if (o === 'COMPLETED') return 'COMPLETED';
    if (o === 'ABORTED') return 'ABORTED';
    if (o === 'TIMEOUT') return 'TIMEOUT';
    if (o === 'FAILED' || o.startsWith('FAILED')) return 'FAILED';
    if (o === 'UNKNOWN' || o === '') return 'UNKNOWN';
    return 'UNKNOWN';
  }
  if (v === 'INDETERMINATE') return 'UNAVAILABLE';
  return 'CLAIMED';
}

/**
 * Outcome badge style from display outcome only.
 * COMPLETED=green, ABORTED/TIMEOUT=yellow, CLAIMED/UNAVAILABLE=gray, FAILED=red, UNKNOWN=muted.
 */
export function getOutcomeBadgeStyle(displayOutcome: string): BadgeTone {
  const o = (displayOutcome ?? '').toUpperCase();
  if (o === 'COMPLETED') return 'good';
  if (o === 'ABORTED' || o === 'TIMEOUT') return 'warn';
  if (o === 'CLAIMED' || o === 'UNAVAILABLE') return 'muted';
  if (o === 'FAILED') return 'bad';
  return 'muted';
}

/**
 * Convenience: style for outcome that respects integrity (use display outcome from getDisplayOutcomeLabel).
 */
export function getOutcomeBadgeStyleWithIntegrity(
  integrityVerdict: string,
  rawOutcome: string
): BadgeTone {
  const display = getDisplayOutcomeLabel(integrityVerdict, rawOutcome);
  return getOutcomeBadgeStyle(display);
}

// ─────────────────────────────────────────────────────────────────────────────
// Responsibility (muted when NO_FAULT; bad when at-fault; hidden when integrity !== VERIFIED)
// ─────────────────────────────────────────────────────────────────────────────

export function getResponsibilityBadgeStyle(judgment: string | null | undefined): BadgeTone {
  const j = (judgment ?? '').toUpperCase().trim();
  if (!j) return 'muted';
  if (j === 'NO_FAULT') return 'muted';
  if (j.includes('BUYER') || j.includes('PROVIDER') || j.includes('AT_FAULT')) return 'bad';
  if (j.includes('INDETERMINATE')) return 'warn';
  if (j.includes('UNAVAILABLE') || j.includes('UNTRUSTED')) return 'muted';
  return 'muted';
}

// ─────────────────────────────────────────────────────────────────────────────
// Action / subcheck helpers (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

export function getActionBadgeStyle(recommendationKind: string): BadgeTone {
  const k = (recommendationKind ?? '').toLowerCase();
  if (/block|avoid|deny/.test(k)) return 'bad';
  if (/rerun|escalate|gate|action/.test(k)) return 'warn';
  return 'muted';
}

export function getSubcheckStyle(value: string): BadgeTone {
  const v = (value ?? '').toUpperCase();
  if (v === 'VALID') return 'good';
  if (v === 'INVALID') return 'bad';
  return 'warn';
}

export function getSignatureBadgeStyle(verified: number, total: number): BadgeTone {
  if (total > 0 && verified === total) return 'good';
  if (total > 0 && verified < total) return 'bad';
  return 'warn';
}
