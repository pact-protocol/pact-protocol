/**
 * Summary extract tests for integrity verdict and status semantics.
 * - Status is transaction outcome only; TAMPERED_STATUS never shown.
 * - getStatusForDisplay returns Claimed (untrusted) or Not recorded when evidence is TAMPERED/INVALID.
 * - getIntegritySummary uses canonical verdict (VERIFIED/INVALID/INDETERMINATE/TAMPERED).
 */

import { describe, it, expect } from 'vitest';
import {
  getStatus,
  getStatusForDisplay,
  getIntegritySummary,
  getEconomicDetailsForDisplay,
  outcomeBadgeFromCode,
  getOutcomeBadge,
  getSummaryExplanation,
  deriveSummaryBadges,
  getOtherSigners,
  getProviderOfRecordPubkey,
} from '../summaryExtract';
import type { AuditorPackData, GCView, IntegrityResult, Judgment } from '../../types';

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

function gcView(overrides: Partial<GCView> = {}): GCView {
  return {
    version: '1',
    executive_summary: { status: 'COMPLETED', what_happened: '', money_moved: true, final_outcome: '', settlement_attempted: true },
    integrity: { hash_chain: 'VALID', signatures_verified: { verified: 1, total: 1 }, final_hash_validation: 'MATCH' },
    responsibility: { last_valid_signed_hash: '', blame_explanation: '', judgment: { confidence: 1 } },
    constitution: { version: '1', hash: 'h', rules_applied: [] },
    ...overrides,
  };
}

describe('getStatus', () => {
  it('never returns TAMPERED_STATUS (status is transaction outcome only)', () => {
    const gv = gcView({ executive_summary: { status: 'TAMPERED_STATUS', what_happened: '', money_moved: false, final_outcome: '', settlement_attempted: false } });
    expect(getStatus(gv)).toBe('Unknown');
  });

  it('returns COMPLETED, ABORTED, FAILED for valid status values', () => {
    expect(getStatus(gcView({ executive_summary: { status: 'COMPLETED', what_happened: '', money_moved: true, final_outcome: '', settlement_attempted: true } }))).toBe('COMPLETED');
    expect(getStatus(gcView({ executive_summary: { status: 'ABORTED_POLICY', what_happened: '', money_moved: false, final_outcome: '', settlement_attempted: false } }))).toBe('ABORTED');
    expect(getStatus(gcView({ executive_summary: { status: 'FAILED', what_happened: '', money_moved: false, final_outcome: '', settlement_attempted: false } }))).toBe('FAILED');
  });
});

describe('getStatusForDisplay', () => {
  it('returns Claimed (untrusted) or Not recorded when integrity verdict is TAMPERED or INVALID', () => {
    const packWithStatus = minimalPack({
      gcView: gcView({ executive_summary: { status: 'COMPLETED', what_happened: '', money_moved: true, final_outcome: '', settlement_attempted: true } }),
    });
    expect(getStatusForDisplay(packWithStatus.gcView, 'TAMPERED')).toBe('Claimed (untrusted)');
    expect(getStatusForDisplay(packWithStatus.gcView, 'INVALID')).toBe('Claimed (untrusted)');
    const packNoStatus = minimalPack({ gcView: gcView({ executive_summary: { status: '', what_happened: '', money_moved: false, final_outcome: '', settlement_attempted: false } }) });
    expect(getStatusForDisplay(packNoStatus.gcView, 'TAMPERED')).toBe('Not recorded');
  });

  it('returns actual status when verdict is VERIFIED', () => {
    const gv = gcView({ executive_summary: { status: 'COMPLETED', what_happened: '', money_moved: true, final_outcome: '', settlement_attempted: true } });
    expect(getStatusForDisplay(gv, 'VERIFIED')).toBe('COMPLETED');
  });
});

describe('getIntegritySummary', () => {
  it('returns VERIFIED and subchecks when all pass (success pack)', () => {
    const pack = minimalPack({
      gcView: gcView({ integrity: { hash_chain: 'VALID', signatures_verified: { verified: 1, total: 1 }, final_hash_validation: 'MATCH' } }),
      packVerifyResult: { recompute_ok: true, checksums_ok: true },
      integrityResult: {
        status: 'VALID',
        checksums: { status: 'VALID', checkedCount: 1, totalCount: 1, failures: [] },
        hashChain: { status: 'VALID' },
        signatures: { status: 'VALID', verifiedCount: 1, totalCount: 1, failures: [] },
        warnings: [],
      } as IntegrityResult,
    });
    const s = getIntegritySummary(pack);
    expect(s.status).toBe('VERIFIED');
    expect(s.signatures).toBe('1/1 verified');
    expect(s.hashChain).toBe('VALID');
    expect(s.checksums).toBe('VALID');
    expect(s.recompute).toBe('OK');
  });

  it('returns TAMPERED when recompute_ok is false (tamper pack)', () => {
    const pack = minimalPack({
      gcView: gcView(),
      packVerifyResult: { recompute_ok: false, checksums_ok: false },
      integrityResult: {
        status: 'TAMPERED',
        checksums: { status: 'INVALID', checkedCount: 0, totalCount: 1, failures: [] },
        hashChain: { status: 'VALID' },
        signatures: { status: 'VALID', verifiedCount: 1, totalCount: 1, failures: [] },
        warnings: [],
      } as IntegrityResult,
    });
    const s = getIntegritySummary(pack);
    expect(s.status).toBe('TAMPERED');
    expect(s.recompute).toBe('FAIL');
  });

  it('returns INVALID when hash chain or signatures fail (never VERIFIED)', () => {
    const pack = minimalPack({
      gcView: gcView({ integrity: { hash_chain: 'INVALID', signatures_verified: { verified: 1, total: 1 }, final_hash_validation: 'MATCH' } }),
      packVerifyResult: { recompute_ok: true, checksums_ok: true },
      integrityResult: {
        status: 'VALID',
        checksums: { status: 'VALID', checkedCount: 1, totalCount: 1, failures: [] },
        hashChain: { status: 'INVALID' },
        signatures: { status: 'VALID', verifiedCount: 1, totalCount: 1, failures: [] },
        warnings: [],
      } as IntegrityResult,
    });
    const s = getIntegritySummary(pack);
    expect(s.status).toBe('INVALID');
    expect(s.hashChain).toBe('INVALID');
  });
});

describe('outcomeBadgeFromCode', () => {
  it('maps outcome_code to Summary outcome badge; missing → UNKNOWN', () => {
    expect(outcomeBadgeFromCode('COMPLETED')).toBe('COMPLETED');
    expect(outcomeBadgeFromCode('ABORTED_POLICY')).toBe('ABORTED');
    expect(outcomeBadgeFromCode('ABORTED_KYA')).toBe('ABORTED');
    expect(outcomeBadgeFromCode('FAILED_PROVIDER_UNREACHABLE')).toBe('TIMEOUT');
    expect(outcomeBadgeFromCode('FAILED')).toBe('FAILED');
    expect(outcomeBadgeFromCode(undefined)).toBe('UNKNOWN');
    expect(outcomeBadgeFromCode('')).toBe('UNKNOWN');
    expect(outcomeBadgeFromCode('UNKNOWN')).toBe('UNKNOWN');
  });
});

describe('deriveSummaryBadges', () => {
  it('gates outcome by integrity: UNAVAILABLE when TAMPERED or INVALID', () => {
    const packTampered = minimalPack({
      gcView: gcView({ executive_summary: { status: 'COMPLETED', what_happened: '', money_moved: true, final_outcome: 'COMPLETED', settlement_attempted: true } }),
      packVerifyResult: { recompute_ok: false },
      integrityResult: { status: 'TAMPERED', checksums: { status: 'INVALID', checkedCount: 0, totalCount: 1, failures: [] }, hashChain: { status: 'VALID' }, signatures: { status: 'VALID', verifiedCount: 1, totalCount: 1, failures: [] }, warnings: [] } as IntegrityResult,
    });
    const badgesT = deriveSummaryBadges(packTampered);
    expect(badgesT.integrityVerdict).toBe('TAMPERED');
    expect(badgesT.outcomeBadge).toBe('CLAIMED');
    expect(badgesT.outcomeTooltip).toContain('altered');
    expect(badgesT.showWarningBanner).toBe(true);

    const packInvalid = minimalPack({
      gcView: gcView({ executive_summary: { status: 'COMPLETED', what_happened: '', money_moved: true, final_outcome: 'COMPLETED', settlement_attempted: true }, integrity: { hash_chain: 'INVALID', signatures_verified: { verified: 0, total: 1 }, final_hash_validation: 'MATCH' } }),
      packVerifyResult: { recompute_ok: true },
      integrityResult: { status: 'VALID', checksums: { status: 'VALID', checkedCount: 1, totalCount: 1, failures: [] }, hashChain: { status: 'INVALID' }, signatures: { status: 'VALID', verifiedCount: 0, totalCount: 1, failures: [] }, warnings: [] } as IntegrityResult,
    });
    const badgesI = deriveSummaryBadges(packInvalid);
    expect(badgesI.integrityVerdict).toBe('INVALID');
    expect(badgesI.outcomeBadge).toBe('CLAIMED');
    expect(badgesI.showWarningBanner).toBe(true);
  });

  it('when VERIFIED, uses deriveOutcomeStatus: COMPLETED / ABORTED / FAILED / TIMEOUT / UNKNOWN', () => {
    const verifiedPack = (es: { status?: string; final_outcome?: string; settlement_attempted?: boolean; money_moved?: boolean }) =>
      minimalPack({
        gcView: gcView({
          executive_summary: {
            status: es.status ?? 'COMPLETED',
            what_happened: '',
            money_moved: es.money_moved ?? true,
            final_outcome: es.final_outcome ?? es.status ?? 'COMPLETED',
            settlement_attempted: es.settlement_attempted ?? true,
          },
          integrity: { hash_chain: 'VALID', signatures_verified: { verified: 1, total: 1 }, final_hash_validation: 'MATCH' },
        }),
        packVerifyResult: { recompute_ok: true, checksums_ok: true },
        integrityResult: { status: 'VALID', checksums: { status: 'VALID', checkedCount: 1, totalCount: 1, failures: [] }, hashChain: { status: 'VALID' }, signatures: { status: 'VALID', verifiedCount: 1, totalCount: 1, failures: [] }, warnings: [] } as IntegrityResult,
      });

    expect(deriveSummaryBadges(verifiedPack({ status: 'COMPLETED' })).outcomeBadge).toBe('COMPLETED');
    expect(deriveSummaryBadges(verifiedPack({ status: 'ABORTED_POLICY' })).outcomeBadge).toBe('ABORTED');
    expect(deriveSummaryBadges(verifiedPack({ status: 'FAILED_PROVIDER_UNREACHABLE' })).outcomeBadge).toBe('TIMEOUT');
    expect(deriveSummaryBadges(verifiedPack({ status: '', settlement_attempted: true, money_moved: true })).outcomeBadge).toBe('COMPLETED');
    expect(deriveSummaryBadges(verifiedPack({ status: '', settlement_attempted: false })).outcomeBadge).toBe('ABORTED');
  });

  it('includes summaryExplanation; for VERIFIED includes outcome', () => {
    const verified = deriveSummaryBadges(minimalPack({
      gcView: gcView({ executive_summary: { status: 'COMPLETED', what_happened: '', money_moved: true, final_outcome: 'COMPLETED', settlement_attempted: true }, integrity: { hash_chain: 'VALID', signatures_verified: { verified: 1, total: 1 }, final_hash_validation: 'MATCH' } }),
      packVerifyResult: { recompute_ok: true, checksums_ok: true },
      integrityResult: { status: 'VALID', checksums: { status: 'VALID', checkedCount: 1, totalCount: 1, failures: [] }, hashChain: { status: 'VALID' }, signatures: { status: 'VALID', verifiedCount: 1, totalCount: 1, failures: [] }, warnings: [] } as IntegrityResult,
    }));
    expect(verified.summaryExplanation).toContain('Evidence verified');
    expect(verified.summaryExplanation).toContain('COMPLETED');
    const tampered = deriveSummaryBadges(minimalPack({
      gcView: gcView(),
      packVerifyResult: { recompute_ok: false },
      integrityResult: { status: 'TAMPERED', checksums: { status: 'INVALID', checkedCount: 0, totalCount: 1, failures: [] }, hashChain: { status: 'VALID' }, signatures: { status: 'VALID', verifiedCount: 1, totalCount: 1, failures: [] }, warnings: [] } as IntegrityResult,
    }));
    expect(tampered.summaryExplanation).toContain('altered after signing');
  });

  describe('badge combinations (420, 101, success, tamper)', () => {
    it('420 pack: VERIFIED + TIMEOUT (2/2 signatures)', () => {
      const pack420 = minimalPack({
        gcView: gcView({
          executive_summary: { status: 'FAILED_PROVIDER_UNREACHABLE', what_happened: '', money_moved: false, final_outcome: 'FAILED_PROVIDER_UNREACHABLE', settlement_attempted: true },
          integrity: { hash_chain: 'VALID', signatures_verified: { verified: 2, total: 2 }, final_hash_validation: 'MATCH' },
        }),
        transcript: JSON.stringify({ rounds: [{}, {}], failure_event: { code: 'PACT-420' } }),
        judgment: { version: '1', dblDetermination: 'NO_FAULT', requiredNextActor: 'NONE', requiredAction: '', terminal: true, confidence: 1, failureCode: 'PACT-420' } as Judgment & { failureCode?: string },
        packVerifyResult: { recompute_ok: true, checksums_ok: true },
        integrityResult: { status: 'VALID', checksums: { status: 'VALID', checkedCount: 1, totalCount: 1, failures: [] }, hashChain: { status: 'VALID' }, signatures: { status: 'VALID', verifiedCount: 2, totalCount: 2, failures: [] }, warnings: [] } as IntegrityResult,
      });
      const badges = deriveSummaryBadges(pack420);
      expect(badges.integrityVerdict).toBe('VERIFIED');
      expect(badges.outcomeBadge).toBe('TIMEOUT');
    });

    it('101 pack: VERIFIED + ABORTED', () => {
      const pack101 = minimalPack({
        gcView: gcView({
          executive_summary: { status: 'ABORTED_POLICY', what_happened: '', money_moved: false, final_outcome: 'ABORTED_POLICY', settlement_attempted: false },
          integrity: { hash_chain: 'VALID', signatures_verified: { verified: 1, total: 1 }, final_hash_validation: 'MATCH' },
        }),
        transcript: JSON.stringify({ rounds: [{}], failure_event: { code: 'PACT-101' } }),
        packVerifyResult: { recompute_ok: true, checksums_ok: true },
        integrityResult: { status: 'VALID', checksums: { status: 'VALID', checkedCount: 1, totalCount: 1, failures: [] }, hashChain: { status: 'VALID' }, signatures: { status: 'VALID', verifiedCount: 1, totalCount: 1, failures: [] }, warnings: [] } as IntegrityResult,
      });
      const badges = deriveSummaryBadges(pack101);
      expect(badges.integrityVerdict).toBe('VERIFIED');
      expect(badges.outcomeBadge).toBe('ABORTED');
    });

    it('success pack: VERIFIED + COMPLETED', () => {
      const packSuccess = minimalPack({
        gcView: gcView({
          executive_summary: { status: 'COMPLETED', what_happened: '', money_moved: true, final_outcome: 'COMPLETED', settlement_attempted: true },
          integrity: { hash_chain: 'VALID', signatures_verified: { verified: 1, total: 1 }, final_hash_validation: 'MATCH' },
        }),
        transcript: JSON.stringify({ rounds: [{}] }),
        packVerifyResult: { recompute_ok: true, checksums_ok: true },
        integrityResult: { status: 'VALID', checksums: { status: 'VALID', checkedCount: 1, totalCount: 1, failures: [] }, hashChain: { status: 'VALID' }, signatures: { status: 'VALID', verifiedCount: 1, totalCount: 1, failures: [] }, warnings: [] } as IntegrityResult,
      });
      const badges = deriveSummaryBadges(packSuccess);
      expect(badges.integrityVerdict).toBe('VERIFIED');
      expect(badges.outcomeBadge).toBe('COMPLETED');
    });

    it('tamper pack: TAMPERED + CLAIMED', () => {
      const packTamper = minimalPack({
        gcView: gcView({
          executive_summary: { status: 'COMPLETED', what_happened: '', money_moved: true, final_outcome: 'COMPLETED', settlement_attempted: true },
          integrity: { hash_chain: 'VALID', signatures_verified: { verified: 1, total: 1 }, final_hash_validation: 'MATCH' },
        }),
        packVerifyResult: { recompute_ok: false },
        integrityResult: { status: 'TAMPERED', checksums: { status: 'INVALID', checkedCount: 0, totalCount: 1, failures: [] }, hashChain: { status: 'VALID' }, signatures: { status: 'VALID', verifiedCount: 1, totalCount: 1, failures: [] }, warnings: [] } as IntegrityResult,
      });
      const badges = deriveSummaryBadges(packTamper);
      expect(badges.integrityVerdict).toBe('TAMPERED');
      expect(badges.outcomeBadge).toBe('CLAIMED');
    });
  });
});

describe('getOutcomeBadge', () => {
  it('returns CLAIMED for INVALID/TAMPERED, UNAVAILABLE for INDETERMINATE', () => {
    expect(getOutcomeBadge('INVALID', 'COMPLETED')).toBe('CLAIMED');
    expect(getOutcomeBadge('TAMPERED', 'ABORTED')).toBe('CLAIMED');
    expect(getOutcomeBadge('INDETERMINATE', 'FAILED')).toBe('UNAVAILABLE');
  });
  it('when VERIFIED, returns COMPLETED / ABORTED / FAILED / TIMEOUT / UNKNOWN', () => {
    expect(getOutcomeBadge('VERIFIED', 'COMPLETED')).toBe('COMPLETED');
    expect(getOutcomeBadge('VERIFIED', 'ABORTED_POLICY')).toBe('ABORTED');
    expect(getOutcomeBadge('VERIFIED', 'FAILED_PROVIDER_UNREACHABLE')).toBe('TIMEOUT');
    expect(getOutcomeBadge('VERIFIED', undefined)).toBe('UNKNOWN');
    expect(getOutcomeBadge('VERIFIED', '')).toBe('UNKNOWN');
  });
});

describe('getSummaryExplanation', () => {
  it('returns explanation text; VERIFIED shows outcome; INVALID/TAMPERED show untrusted copy (no Trust Signals/Passport)', () => {
    expect(getSummaryExplanation('VERIFIED')).toContain('Evidence verified');
    expect(getSummaryExplanation('VERIFIED')).toContain('Outcome:');
    expect(getSummaryExplanation('VERIFIED', 'COMPLETED')).toContain('Evidence verified');
    expect(getSummaryExplanation('VERIFIED', 'COMPLETED')).toContain('COMPLETED');
    expect(getSummaryExplanation('INVALID')).toContain('failed verification');
    expect(getSummaryExplanation('INVALID')).toContain('untrusted');
    expect(getSummaryExplanation('TAMPERED')).toContain('altered after signing');
    expect(getSummaryExplanation('TAMPERED')).toContain('Do not rely on outcome or responsibility');
    expect(getSummaryExplanation('INDETERMINATE')).toContain('could not be fully determined');
  });
});

describe('getEconomicDetailsForDisplay', () => {
  it('returns Claimed (untrusted) for economic values when verdict is TAMPERED or INVALID', () => {
    const pack = minimalPack({ gcView: gcView() });
    const tampered = getEconomicDetailsForDisplay(pack, 'TAMPERED');
    expect(tampered.asset).toBe('Claimed (untrusted)');
    expect(tampered.amount).toBe('Claimed (untrusted)');
    expect(tampered.rail).toBe('Claimed (untrusted)');
    expect(tampered.reference).toBe('Claimed (untrusted)');
    const invalid = getEconomicDetailsForDisplay(pack, 'INVALID');
    expect(invalid.asset).toBe('Claimed (untrusted)');
  });

  it('returns normal economic details when verdict is VERIFIED', () => {
    const pack = minimalPack({ gcView: gcView() });
    const verified = getEconomicDetailsForDisplay(pack, 'VERIFIED');
    expect(verified.asset).not.toBe('Claimed (untrusted)');
    const indet = getEconomicDetailsForDisplay(pack, 'INDETERMINATE');
    expect(indet.asset).toBe('Claimed (untrusted)');
  });
});

describe('getOtherSigners', () => {
  it('returns additional signers from transcript rounds beyond buyer and provider', () => {
    const buyerPk = 'buyer-pubkey-111';
    const providerPk = 'provider-pubkey-222';
    const expertPk = 'expert-a-pubkey-333';
    const transcript = JSON.stringify({
      rounds: [
        { round_number: 0, round_type: 'INTENT', agent_id: 'buyer', signature: { signer_public_key_b58: buyerPk } },
        { round_number: 1, round_type: 'ASK', agent_id: 'gallery', signature: { signer_public_key_b58: providerPk } },
        { round_number: 2, round_type: 'ASK', agent_id: 'expert_a', signature: { signer_public_key_b58: expertPk } },
      ],
    });
    const pack = minimalPack({
      gcView: gcView({
        subject: {
          transcript_id_or_hash: 'tid',
          parties: [
            { role: 'buyer', signer_pubkey: buyerPk },
            { role: 'provider', signer_pubkey: providerPk },
          ],
        },
      }),
      transcript,
    });
    const other = getOtherSigners(pack);
    expect(other).toHaveLength(1);
    expect(other[0].pubkey).toBe(expertPk);
    expect(other[0].agent_label).toBe('expert_a');
  });

  it('returns empty when only buyer and provider sign', () => {
    const transcript = JSON.stringify({
      rounds: [
        { round_number: 0, round_type: 'INTENT', agent_id: 'buyer', signature: { signer_public_key_b58: 'pk-buyer' } },
        { round_number: 1, round_type: 'ACCEPT', agent_id: 'buyer', signature: { signer_public_key_b58: 'pk-buyer' } },
      ],
    });
    const pack = minimalPack({ gcView: gcView(), transcript });
    expect(getOtherSigners(pack)).toHaveLength(0);
  });
});

describe('getProviderOfRecordPubkey', () => {
  it('prefers ACCEPT content_summary.to over gc_view parties (Art pilot: gallery is provider-of-record)', () => {
    const galleryPk = 'DCi6DFQteG5nfh8WDDTxYsd7yoeB7bJiYErgohRaaUgA';
    const expertBPk = '7vqQqT3Ds9WfM3T8PGEDkwgqu9qV8733HBVcj4Ee8y88';
    const transcript = JSON.stringify({
      rounds: [
        { round_number: 0, round_type: 'INTENT', agent_id: 'buyer', signature: { signer_public_key_b58: 'buyer-pk' } },
        { round_number: 1, round_type: 'ASK', agent_id: 'gallery', signature: { signer_public_key_b58: galleryPk } },
        { round_number: 3, round_type: 'ASK', agent_id: 'expert_b', signature: { signer_public_key_b58: expertBPk } },
        {
          round_number: 5,
          round_type: 'ACCEPT',
          agent_id: 'buyer',
          signature: { signer_public_key_b58: 'buyer-pk' },
          content_summary: { to: galleryPk, from: 'buyer-pk', amount: 300000 },
        },
      ],
    });
    const pack = minimalPack({
      gcView: gcView({
        subject: {
          transcript_id_or_hash: 'tid',
          parties: [
            { role: 'buyer', signer_pubkey: 'buyer-pk' },
            { role: 'provider', signer_pubkey: expertBPk },
          ],
        },
      }),
      transcript,
    });
    expect(getProviderOfRecordPubkey(pack)).toBe(galleryPk);
  });
});
