/**
 * Canonical outcome status: Success → COMPLETED, 101 → ABORTED, 420 → TIMEOUT, Tamper → CLAIMED.
 */

import { describe, it, expect } from 'vitest';
import { deriveOutcomeStatus } from '../outcomeStatus';
import type { AuditorPackData, GCView, Judgment } from '../../types';

function gcView(overrides: Partial<GCView> = {}): GCView {
  return {
    version: '1',
    executive_summary: {
      status: 'COMPLETED',
      what_happened: '',
      money_moved: true,
      final_outcome: 'COMPLETED',
      settlement_attempted: true,
    },
    integrity: {
      hash_chain: 'VALID',
      signatures_verified: { verified: 1, total: 1 },
      final_hash_validation: 'MATCH',
    },
    responsibility: { last_valid_signed_hash: '', blame_explanation: '', judgment: { confidence: 1 } },
    constitution: { version: '1', hash: 'h', rules_applied: [] },
    ...overrides,
  };
}

function minimalPack(overrides: Partial<AuditorPackData> & { gcView: GCView }): AuditorPackData {
  return {
    manifest: {
      transcript_id: 'tid',
      constitution_version: '1',
      constitution_hash: 'h',
      created_at_ms: 0,
      tool_version: '0',
    },
    gcView: overrides.gcView,
    judgment: {
      version: '1',
      dblDetermination: 'NO_FAULT',
      requiredNextActor: 'NONE',
      requiredAction: '',
      terminal: true,
      confidence: 1,
    },
    insurerSummary: { version: '1', coverage: 'COVERED', risk_factors: [], surcharges: [] },
    checksums: '',
    constitution: '',
    transcriptId: 'tid',
    source: 'drag_drop',
    ...overrides,
  };
}

describe('deriveOutcomeStatus', () => {
  it('Success pack → VERIFIED + COMPLETED', () => {
    const pack = minimalPack({
      gcView: gcView({
        executive_summary: {
          status: 'COMPLETED',
          what_happened: '',
          money_moved: true,
          final_outcome: 'COMPLETED',
          settlement_attempted: true,
        },
      }),
    });
    const r = deriveOutcomeStatus('VERIFIED', pack);
    expect(r.badge).toBe('COMPLETED');
  });

  it('101 pack → VERIFIED + ABORTED (from status or failure_event)', () => {
    const packFromStatus = minimalPack({
      gcView: gcView({
        executive_summary: {
          status: 'ABORTED_POLICY',
          what_happened: '',
          money_moved: false,
          final_outcome: 'ABORTED_POLICY',
          settlement_attempted: false,
        },
      }),
    });
    expect(deriveOutcomeStatus('VERIFIED', packFromStatus).badge).toBe('ABORTED');

    const packFromTranscript = minimalPack({
      gcView: gcView({ executive_summary: { status: '', what_happened: '', money_moved: false, final_outcome: '', settlement_attempted: false } }),
      transcript: JSON.stringify({ failure_event: { code: 'PACT-101' } }),
    });
    expect(deriveOutcomeStatus('VERIFIED', packFromTranscript).badge).toBe('ABORTED');
  });

  it('420 pack → VERIFIED + TIMEOUT (from status or failure_event)', () => {
    const packFromStatus = minimalPack({
      gcView: gcView({
        executive_summary: {
          status: 'FAILED_PROVIDER_UNREACHABLE',
          what_happened: '',
          money_moved: false,
          final_outcome: 'FAILED_PROVIDER_UNREACHABLE',
          settlement_attempted: true,
        },
      }),
    });
    expect(deriveOutcomeStatus('VERIFIED', packFromStatus).badge).toBe('TIMEOUT');

    const packFromTranscript = minimalPack({
      gcView: gcView({ executive_summary: { status: '', what_happened: '', money_moved: false, final_outcome: '', settlement_attempted: true } }),
      transcript: JSON.stringify({ failure_event: { code: 'PACT-420' } }),
    });
    expect(deriveOutcomeStatus('VERIFIED', packFromTranscript).badge).toBe('TIMEOUT');
  });

  it('Tamper pack → TAMPERED + CLAIMED', () => {
    const pack = minimalPack({
      gcView: gcView({ executive_summary: { status: 'COMPLETED', what_happened: '', money_moved: true, final_outcome: 'COMPLETED', settlement_attempted: true } }),
    });
    const r = deriveOutcomeStatus('TAMPERED', pack);
    expect(r.badge).toBe('CLAIMED');
    expect(r.reason).toContain('altered');
  });

  it('INVALID → CLAIMED', () => {
    const pack = minimalPack({ gcView: gcView() });
    const r = deriveOutcomeStatus('INVALID', pack);
    expect(r.badge).toBe('CLAIMED');
    expect(r.reason).toContain('Verification failed');
  });

  it('VERIFIED with no outcome data falls back to settlement flags then UNKNOWN', () => {
    const packSettlement = minimalPack({
      gcView: gcView({
        executive_summary: {
          status: '',
          what_happened: '',
          money_moved: true,
          final_outcome: '',
          settlement_attempted: true,
        },
      }),
    });
    expect(deriveOutcomeStatus('VERIFIED', packSettlement).badge).toBe('COMPLETED');

    const packAbort = minimalPack({
      gcView: gcView({
        executive_summary: {
          status: '',
          what_happened: '',
          money_moved: false,
          final_outcome: '',
          settlement_attempted: false,
        },
      }),
    });
    expect(deriveOutcomeStatus('VERIFIED', packAbort).badge).toBe('ABORTED');

    const packNoData = minimalPack({
      gcView: gcView({
        executive_summary: {
          status: '',
          what_happened: '',
          money_moved: undefined as unknown as boolean,
          final_outcome: '',
          settlement_attempted: undefined as unknown as boolean,
        },
      }),
      transcript: undefined,
      judgment: undefined,
    });
    const r = deriveOutcomeStatus('VERIFIED', packNoData);
    expect(r.badge).toBe('UNKNOWN');
    expect(r.reason).toContain('not recorded');
  });
});
