import {
  badgeToneToCssClass,
  getIntegrityBadgeStyle,
  getOutcomeBadgeStyle,
  getResponsibilityBadgeStyle,
  getActionBadgeStyle,
  getSubcheckStyle,
  getSignatureBadgeStyle,
  isIntegrityTampered,
} from '../badgeSemantics';

describe('badgeSemantics', () => {
  describe('badgeToneToCssClass', () => {
    it('maps good/warn/bad/muted to status-* classes', () => {
      expect(badgeToneToCssClass('good')).toBe('status-good');
      expect(badgeToneToCssClass('warn')).toBe('status-warn');
      expect(badgeToneToCssClass('bad')).toBe('status-bad');
      expect(badgeToneToCssClass('muted')).toBe('status-muted');
    });
  });

  describe('getIntegrityBadgeStyle', () => {
    it('returns good for VERIFIED, warn for INDETERMINATE, bad for INVALID/TAMPERED', () => {
      expect(getIntegrityBadgeStyle('VERIFIED')).toBe('good');
      expect(getIntegrityBadgeStyle('INDETERMINATE')).toBe('warn');
      expect(getIntegrityBadgeStyle('INVALID')).toBe('bad');
      expect(getIntegrityBadgeStyle('TAMPERED')).toBe('bad');
    });
  });

  describe('getOutcomeBadgeStyle', () => {
    it('returns good for COMPLETED, warn for ABORTED/TIMEOUT, muted for CLAIMED/UNAVAILABLE, bad for FAILED', () => {
      expect(getOutcomeBadgeStyle('COMPLETED')).toBe('good');
      expect(getOutcomeBadgeStyle('ABORTED')).toBe('warn');
      expect(getOutcomeBadgeStyle('TIMEOUT')).toBe('warn');
      expect(getOutcomeBadgeStyle('CLAIMED')).toBe('muted');
      expect(getOutcomeBadgeStyle('UNAVAILABLE')).toBe('muted');
      expect(getOutcomeBadgeStyle('FAILED')).toBe('bad');
    });
  });

  describe('getResponsibilityBadgeStyle', () => {
    it('returns muted for NO_FAULT (not green)', () => {
      expect(getResponsibilityBadgeStyle('NO_FAULT')).toBe('muted');
    });
    it('returns bad for BUYER_AT_FAULT and PROVIDER_AT_FAULT', () => {
      expect(getResponsibilityBadgeStyle('BUYER_AT_FAULT')).toBe('bad');
      expect(getResponsibilityBadgeStyle('PROVIDER_AT_FAULT')).toBe('bad');
    });
    it('returns warn for INDETERMINATE, muted for UNAVAILABLE', () => {
      expect(getResponsibilityBadgeStyle('INDETERMINATE')).toBe('warn');
      expect(getResponsibilityBadgeStyle('UNAVAILABLE')).toBe('muted');
    });
  });

  describe('getActionBadgeStyle', () => {
    it('returns warn for rerun/escalate/gates, bad for block/avoid, muted for informational', () => {
      expect(getActionBadgeStyle('rerun')).toBe('warn');
      expect(getActionBadgeStyle('escalate')).toBe('warn');
      expect(getActionBadgeStyle('block')).toBe('bad');
      expect(getActionBadgeStyle('avoid')).toBe('bad');
      expect(getActionBadgeStyle('informational')).toBe('muted');
    });
  });

  describe('getSubcheckStyle', () => {
    it('returns good for VALID, bad for INVALID, warn otherwise', () => {
      expect(getSubcheckStyle('VALID')).toBe('good');
      expect(getSubcheckStyle('INVALID')).toBe('bad');
      expect(getSubcheckStyle('UNAVAILABLE')).toBe('warn');
    });
  });

  describe('getSignatureBadgeStyle', () => {
    it('returns good when all verified, bad when some failed, warn when none', () => {
      expect(getSignatureBadgeStyle(2, 2)).toBe('good');
      expect(getSignatureBadgeStyle(1, 2)).toBe('bad');
      expect(getSignatureBadgeStyle(0, 2)).toBe('bad');
      expect(getSignatureBadgeStyle(0, 0)).toBe('warn');
    });
  });

  describe('isIntegrityTampered', () => {
    it('returns true only for TAMPERED', () => {
      expect(isIntegrityTampered('TAMPERED')).toBe(true);
      expect(isIntegrityTampered('INVALID')).toBe(false);
    });
  });
});
