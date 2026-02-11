/**
 * Minimal AuditorPackData mocks that produce each SummaryState when passed to SummaryPanel.
 * Used by SummaryPanel.snap.test.tsx to assert badge labels and gating (blocked/untrusted).
 */

import type { AuditorPackData, IntegrityResult, GCView, Judgment, InsurerSummary, Manifest } from '../../types';

const baseManifest: Manifest = {
  transcript_id: 'test-transcript-id',
  constitution_version: '1',
  constitution_hash: 'abc',
  created_at_ms: 0,
  tool_version: '0.0.0',
};

const baseJudgment: Judgment = {
  version: '1',
  dblDetermination: 'NO_FAULT',
  requiredNextActor: 'NONE',
  requiredAction: 'NONE',
  terminal: true,
  confidence: 100,
};

const baseInsurer: InsurerSummary = {
  version: '1',
  coverage: 'COVERED',
  risk_factors: [],
  surcharges: [],
};

function baseGcView(overrides: Partial<GCView['executive_summary'] & { hash_chain?: 'VALID' | 'INVALID'; sigVerified?: number; sigTotal?: number }> = {}): GCView {
  const es = {
    status: 'COMPLETED',
    what_happened: 'Completed',
    money_moved: true,
    final_outcome: 'COMPLETED',
    settlement_attempted: true,
    ...overrides,
  };
  const hashChain = overrides.hash_chain ?? 'VALID';
  const sigVerified = overrides.sigVerified ?? 1;
  const sigTotal = overrides.sigTotal ?? 1;
  return {
    version: '1',
    executive_summary: es,
    integrity: {
      hash_chain: hashChain,
      signatures_verified: { verified: sigVerified, total: sigTotal },
      final_hash_validation: hashChain === 'VALID' ? 'MATCH' : 'MISMATCH',
    },
    responsibility: {
      judgment: { fault_domain: 'NONE', confidence: 100, terminal: true },
      last_valid_signed_hash: '',
      blame_explanation: '',
    },
    constitution: { version: '1', hash: 'abc', rules_applied: [] },
  };
}

function packWithIntegrity(integrity: IntegrityResult | undefined, gcView: GCView, judgment: Judgment = baseJudgment): AuditorPackData {
  return {
    manifest: baseManifest,
    gcView,
    judgment,
    insurerSummary: baseInsurer,
    checksums: '{}',
    constitution: '',
    transcriptId: 'test-transcript-id',
    source: 'drag_drop',
    integrityResult: integrity,
  };
}

/** Produces TRUSTED_COMPLETED: VERIFIED + COMPLETED */
export function mockPackTrustedCompleted(): AuditorPackData {
  return packWithIntegrity(
    {
      status: 'VALID',
      hashChain: { status: 'VALID' },
      signatures: { status: 'VALID', verifiedCount: 1, totalCount: 1, failures: [] },
      checksums: { status: 'VALID', checkedCount: 0, totalCount: 0, failures: [] },
      warnings: [],
    },
    baseGcView({ status: 'COMPLETED', final_outcome: 'COMPLETED', money_moved: true, settlement_attempted: true })
  );
}

/** Produces TRUSTED_ABORTED: VERIFIED + ABORTED */
export function mockPackTrustedAborted(): AuditorPackData {
  return packWithIntegrity(
    {
      status: 'VALID',
      hashChain: { status: 'VALID' },
      signatures: { status: 'VALID', verifiedCount: 1, totalCount: 1, failures: [] },
      checksums: { status: 'VALID', checkedCount: 0, totalCount: 0, failures: [] },
      warnings: [],
    },
    baseGcView({ status: 'ABORTED_POLICY', final_outcome: 'ABORTED_POLICY', money_moved: false, settlement_attempted: false }),
    { ...baseJudgment, dblDetermination: 'ABORTED' }
  );
}

/** Produces TRUSTED_TIMEOUT: VERIFIED + TIMEOUT (e.g. PACT-420) */
export function mockPackTrustedTimeout(): AuditorPackData {
  return packWithIntegrity(
    {
      status: 'VALID',
      hashChain: { status: 'VALID' },
      signatures: { status: 'VALID', verifiedCount: 1, totalCount: 1, failures: [] },
      checksums: { status: 'VALID', checkedCount: 0, totalCount: 0, failures: [] },
      warnings: [],
    },
    baseGcView({ status: 'FAILED', final_outcome: 'FAILED_PROVIDER_UNREACHABLE', money_moved: false, settlement_attempted: true }),
    { ...baseJudgment, dblDetermination: 'FAILED' }
  );
}

/** Produces UNTRUSTED_INVALID: INVALID + UNTRUSTED */
export function mockPackUntrustedInvalid(): AuditorPackData {
  return packWithIntegrity(
    {
      status: 'VALID', // viewer can set INVALID from subchecks
      hashChain: { status: 'INVALID' },
      signatures: { status: 'VALID', verifiedCount: 1, totalCount: 1, failures: [] },
      checksums: { status: 'VALID', checkedCount: 0, totalCount: 0, failures: [] },
      warnings: [],
    },
    baseGcView({ hash_chain: 'INVALID' })
  );
}

/** Produces UNTRUSTED_TAMPERED: TAMPERED + UNTRUSTED */
export function mockPackUntrustedTampered(): AuditorPackData {
  return packWithIntegrity(
    {
      status: 'TAMPERED',
      hashChain: { status: 'INVALID' },
      signatures: { status: 'INVALID', verifiedCount: 0, totalCount: 1, failures: [] },
      checksums: { status: 'INVALID', checkedCount: 0, totalCount: 0, failures: [] },
      warnings: [],
    },
    baseGcView({ hash_chain: 'INVALID' })
  );
}
