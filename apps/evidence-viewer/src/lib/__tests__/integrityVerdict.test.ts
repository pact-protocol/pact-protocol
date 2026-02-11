/**
 * Unit tests for canonical integrity verdict (Summary badge + consistency).
 * Verdict is evidence integrity only; never transaction status.
 */

import { describe, it, expect } from 'vitest';
import {
  getIntegrityVerdict,
  getIntegrityVerdictLabel,
  getIntegrityVerdictClass,
} from '../integrityVerdict';
import type { AuditorPackData, IntegrityResult, GCView } from '../../types';

function minimalPack(overrides: Partial<AuditorPackData> & { gcView: GCView }): AuditorPackData {
  return {
    manifest: { transcript_id: 'tid', constitution_version: '1', constitution_hash: 'h', created_at_ms: 0, tool_version: '0' },
    gcView: overrides.gcView,
    judgment: { version: '1', dblDetermination: 'NO_FAULT', requiredNextActor: 'NONE', requiredAction: '', terminal: true, confidence: 1 },
    insurerSummary: { version: '1', coverage: 'COVERED', risk_factors: [], surcharges: [] },
    checksums: '',
    constitution: '',
    transcriptId: 'tid',
    source: 'drag_drop',
    ...overrides,
  };
}

function gcView(integrity: { hash_chain?: 'VALID' | 'INVALID'; signatures_verified?: { verified: number; total: number } }): GCView {
  return {
    version: '1',
    executive_summary: { status: 'COMPLETED', what_happened: '', money_moved: true, final_outcome: '', settlement_attempted: true },
    integrity: {
      hash_chain: integrity.hash_chain ?? 'VALID',
      signatures_verified: integrity.signatures_verified ?? { verified: 1, total: 1 },
      final_hash_validation: 'MATCH',
    },
    responsibility: { last_valid_signed_hash: '', blame_explanation: '', judgment: { confidence: 1 } },
    constitution: { version: '1', hash: 'h', rules_applied: [] },
  };
}

describe('getIntegrityVerdict', () => {
  it('returns VERIFIED when all subchecks pass (success pack)', () => {
    const pack = minimalPack({
      gcView: gcView({ hash_chain: 'VALID', signatures_verified: { verified: 1, total: 1 } }),
      packVerifyResult: { recompute_ok: true, checksums_ok: true },
      integrityResult: {
        status: 'VALID',
        checksums: { status: 'VALID', checkedCount: 1, totalCount: 1, failures: [] },
        hashChain: { status: 'VALID' },
        signatures: { status: 'VALID', verifiedCount: 1, totalCount: 1, failures: [] },
        warnings: [],
      } as IntegrityResult,
    });
    const v = getIntegrityVerdict(pack);
    expect(v.verdict).toBe('VERIFIED');
    expect(v.color).toBe('green');
    expect(v.details.recomputeOk).toBe(true);
    expect(v.details.checksumsOk).toBe(true);
    expect(v.details.hashChainOk).toBe(true);
    expect(v.details.sigsVerified).toBe(1);
    expect(v.details.sigsTotal).toBe(1);
  });

  it('returns VERIFIED for policy abort pack (status ABORTED is transaction outcome, not integrity)', () => {
    const pack = minimalPack({
      gcView: {
        ...gcView({ hash_chain: 'VALID', signatures_verified: { verified: 1, total: 1 } }),
        executive_summary: { status: 'ABORTED_POLICY', what_happened: '', money_moved: false, final_outcome: '', settlement_attempted: false },
      },
      packVerifyResult: { recompute_ok: true, checksums_ok: true },
      integrityResult: {
        status: 'VALID',
        checksums: { status: 'VALID', checkedCount: 1, totalCount: 1, failures: [] },
        hashChain: { status: 'VALID' },
        signatures: { status: 'VALID', verifiedCount: 1, totalCount: 1, failures: [] },
        warnings: [],
      } as IntegrityResult,
    });
    const v = getIntegrityVerdict(pack);
    expect(v.verdict).toBe('VERIFIED');
  });

  it('returns TAMPERED when recompute_ok is false (tamper pack)', () => {
    const pack = minimalPack({
      gcView: gcView({ hash_chain: 'VALID', signatures_verified: { verified: 1, total: 1 } }),
      packVerifyResult: { recompute_ok: false, checksums_ok: false },
      integrityResult: {
        status: 'TAMPERED',
        checksums: { status: 'INVALID', checkedCount: 0, totalCount: 1, failures: ['mismatch'] },
        hashChain: { status: 'VALID' },
        signatures: { status: 'VALID', verifiedCount: 1, totalCount: 1, failures: [] },
        warnings: [],
      } as IntegrityResult,
    });
    const v = getIntegrityVerdict(pack);
    expect(v.verdict).toBe('TAMPERED');
    expect(v.color).toBe('red');
  });

  it('returns TAMPERED when integrityResult.status is TAMPERED', () => {
    const pack = minimalPack({
      gcView: gcView({ hash_chain: 'VALID', signatures_verified: { verified: 1, total: 1 } }),
      integrityResult: {
        status: 'TAMPERED',
        checksums: { status: 'VALID', checkedCount: 1, totalCount: 1, failures: [] },
        hashChain: { status: 'VALID' },
        signatures: { status: 'VALID', verifiedCount: 1, totalCount: 1, failures: [] },
        warnings: [],
      } as IntegrityResult,
    });
    const v = getIntegrityVerdict(pack);
    expect(v.verdict).toBe('TAMPERED');
  });

  it('returns INVALID when hash_chain is INVALID (provider failure / bad chain)', () => {
    const pack = minimalPack({
      gcView: gcView({ hash_chain: 'INVALID', signatures_verified: { verified: 1, total: 1 } }),
      packVerifyResult: { recompute_ok: true, checksums_ok: true },
      integrityResult: {
        status: 'VALID',
        checksums: { status: 'VALID', checkedCount: 1, totalCount: 1, failures: [] },
        hashChain: { status: 'INVALID', details: 'mismatch' },
        signatures: { status: 'VALID', verifiedCount: 1, totalCount: 1, failures: [] },
        warnings: [],
      } as IntegrityResult,
    });
    const v = getIntegrityVerdict(pack);
    expect(v.verdict).toBe('INVALID');
    expect(v.color).toBe('red');
  });

  it('returns INVALID when signatures not fully verified', () => {
    const pack = minimalPack({
      gcView: gcView({ hash_chain: 'VALID', signatures_verified: { verified: 0, total: 1 } }),
      packVerifyResult: { recompute_ok: true, checksums_ok: true },
      integrityResult: {
        status: 'VALID',
        checksums: { status: 'VALID', checkedCount: 1, totalCount: 1, failures: [] },
        hashChain: { status: 'VALID' },
        signatures: { status: 'INVALID', verifiedCount: 0, totalCount: 1, failures: [] },
        warnings: [],
      } as IntegrityResult,
    });
    const v = getIntegrityVerdict(pack);
    expect(v.verdict).toBe('INVALID');
  });

  it('returns INDETERMINATE when pack has explicit INDETERMINATE and not tampered', () => {
    const pack = minimalPack({
      gcView: gcView({ hash_chain: 'VALID', signatures_verified: { verified: 1, total: 1 } }),
      integrityResult: {
        status: 'INDETERMINATE',
        checksums: { status: 'UNAVAILABLE', checkedCount: 0, totalCount: 0, failures: [] },
        hashChain: { status: 'VALID' },
        signatures: { status: 'VALID', verifiedCount: 1, totalCount: 1, failures: [] },
        warnings: [],
      } as IntegrityResult,
    });
    const v = getIntegrityVerdict(pack);
    expect(v.verdict).toBe('INDETERMINATE');
    expect(v.color).toBe('amber');
  });
});

describe('getIntegrityVerdictLabel', () => {
  it('returns correct badge labels', () => {
    expect(getIntegrityVerdictLabel('VERIFIED')).toBe('✓ VERIFIED');
    expect(getIntegrityVerdictLabel('INDETERMINATE')).toBe('⚠ INDETERMINATE');
    expect(getIntegrityVerdictLabel('INVALID')).toBe('✖ INVALID');
    expect(getIntegrityVerdictLabel('TAMPERED')).toBe('⛔ TAMPERED');
  });
});

describe('getIntegrityVerdictClass', () => {
  it('returns status-good for VERIFIED, status-warn for INDETERMINATE, status-bad for INVALID/TAMPERED', () => {
    expect(getIntegrityVerdictClass('VERIFIED')).toBe('status-good');
    expect(getIntegrityVerdictClass('INDETERMINATE')).toBe('status-warn');
    expect(getIntegrityVerdictClass('INVALID')).toBe('status-bad');
    expect(getIntegrityVerdictClass('TAMPERED')).toBe('status-bad');
  });
});
