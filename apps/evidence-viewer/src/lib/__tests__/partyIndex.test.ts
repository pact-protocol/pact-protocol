/**
 * Party index: role classification, expert/other split, display_name from snapshot.
 */

import { describe, it, expect } from 'vitest';
import {
  buildPartyIndex,
  buildPartiesView,
  getExpertContributors,
  getOtherAgents,
  getPartyByPubkey,
  getRoleLabel,
  getAnchorBadgeLabel,
} from '../partyIndex';
import type { AuditorPackData, PassportSnapshotView } from '../../types';

function minimalPack(overrides: Partial<AuditorPackData> & { gcView: AuditorPackData['gcView'] }): AuditorPackData {
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
  } as AuditorPackData;
}

function gcView(overrides: Partial<AuditorPackData['gcView']> = {}): AuditorPackData['gcView'] {
  return {
    version: '1',
    executive_summary: { status: 'COMPLETED', what_happened: '', money_moved: true, final_outcome: '', settlement_attempted: true },
    integrity: { hash_chain: 'VALID', signatures_verified: { verified: 1, total: 1 }, final_hash_validation: 'MATCH' },
    responsibility: { last_valid_signed_hash: '', blame_explanation: '', judgment: { confidence: 1 } },
    constitution: { version: '1', hash: 'h', rules_applied: [] },
    ...overrides,
  } as AuditorPackData['gcView'];
}

describe('buildPartyIndex', () => {
  it('classifies buyer and provider from transcript + gc_view parties', () => {
    const buyerPk = 'buyer-pk';
    const providerPk = 'provider-pk';
    const transcript = JSON.stringify({
      rounds: [
        { round_number: 0, round_type: 'INTENT', agent_id: 'buyer', signature: { signer_public_key_b58: buyerPk } },
        { round_number: 1, round_type: 'ASK', agent_id: 'gallery', signature: { signer_public_key_b58: providerPk } },
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
    const index = buildPartyIndex(pack, null);
    const buyer = getPartyByPubkey(index, buyerPk);
    const provider = getPartyByPubkey(index, providerPk);
    expect(buyer?.role).toBe('buyer');
    expect(provider?.role).toBe('provider');
  });

  it('classifies expert only when credential_verified (anchor), else agent', () => {
    const buyerPk = 'bpk';
    const galleryPk = 'gallery-pk';
    const expertPk = 'expert-a-pk';
    const transcript = JSON.stringify({
      rounds: [
        { round_number: 0, round_type: 'INTENT', agent_id: 'buyer', signature: { signer_public_key_b58: buyerPk } },
        { round_number: 1, round_type: 'ASK', agent_id: 'gallery', signature: { signer_public_key_b58: galleryPk } },
        { round_number: 2, round_type: 'ASK', agent_id: 'expert_a', signature: { signer_public_key_b58: expertPk } },
      ],
    });
    const pack = minimalPack({
      gcView: gcView({
        subject: {
          transcript_id_or_hash: 'tid',
          parties: [
            { role: 'buyer', signer_pubkey: buyerPk },
            { role: 'provider', signer_pubkey: galleryPk },
          ],
        },
      }),
      transcript,
    });
    const index = buildPartyIndex(pack, null);
    const expertEntry = getPartyByPubkey(index, expertPk);
    expect(expertEntry?.role).toBe('agent');
    expect(expertEntry?.agent_id).toBe('expert_a');
  });

  it('getExpertContributors and getOtherAgents return correct lists', () => {
    const buyerPk = 'bpk';
    const providerPk = 'gallery-pk';
    const expertPk = 'expert-a-pk';
    const otherPk = 'imaging-v2-pk';
    const transcript = JSON.stringify({
      rounds: [
        { round_number: 0, round_type: 'INTENT', agent_id: 'buyer', signature: { signer_public_key_b58: buyerPk } },
        { round_number: 1, round_type: 'ASK', agent_id: 'gallery', signature: { signer_public_key_b58: providerPk } },
        { round_number: 2, round_type: 'ASK', agent_id: 'expert_a', signature: { signer_public_key_b58: expertPk } },
        { round_number: 3, round_type: 'ASK', agent_id: 'imaging_v2', signature: { signer_public_key_b58: otherPk } },
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
    const snapshotWithExpert: PassportSnapshotView = {
      entities: [
        {
          signer_public_key_b58: expertPk,
          anchors: [{ type: 'credential_verified', display_name: 'Art Expert' }],
        },
      ],
    };
    const index = buildPartyIndex(pack, snapshotWithExpert);
    const experts = getExpertContributors(index);
    const other = getOtherAgents(index, pack);
    expect(experts.map((e) => e.pubkey)).toContain(expertPk);
    expect(other.map((e) => e.pubkey)).toContain(otherPk);
  });
});

describe('buildPartiesView', () => {
  it('dedupes by pubkey: each party in exactly one group (BUYER > PROVIDER > EXPERT > AGENT)', () => {
    const buyerPk = 'bpk';
    const providerPk = 'gallery-pk';
    const expertPk = 'expert-a-pk';
    const otherPk = 'imaging-v2-pk';
    const transcript = JSON.stringify({
      rounds: [
        { round_number: 0, round_type: 'INTENT', agent_id: 'buyer', signature: { signer_public_key_b58: buyerPk } },
        { round_number: 1, round_type: 'ASK', agent_id: 'gallery', signature: { signer_public_key_b58: providerPk } },
        { round_number: 2, round_type: 'ASK', agent_id: 'expert_a', signature: { signer_public_key_b58: expertPk } },
        { round_number: 3, round_type: 'ASK', agent_id: 'imaging_v2', signature: { signer_public_key_b58: otherPk } },
      ],
    });
    const snapshotWithExpert: PassportSnapshotView = {
      entities: [
        { signer_public_key_b58: expertPk, anchors: [{ type: 'credential_verified' }] },
      ],
    };
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
    const index = buildPartyIndex(pack, snapshotWithExpert);
    const view = buildPartiesView(index, pack, snapshotWithExpert);
    expect(view.primary[0]?.viewModel.pubkey).toBe(buyerPk);
    expect(view.primary[1]?.viewModel.pubkey).toBe(providerPk);
    expect(view.experts.map((e) => e.pubkey)).toContain(expertPk);
    expect(view.experts.map((e) => e.pubkey)).not.toContain(buyerPk);
    expect(view.experts.map((e) => e.pubkey)).not.toContain(providerPk);
    expect(view.operational.map((e) => e.pubkey)).toContain(otherPk);
  });
});

describe('getRoleLabel', () => {
  it('returns display labels for each role', () => {
    expect(getRoleLabel('buyer')).toBe('Buyer');
    expect(getRoleLabel('provider')).toBe('Provider');
    expect(getRoleLabel('expert')).toBe('Expert');
    expect(getRoleLabel('agent')).toBe('Agent');
    expect(getRoleLabel('unknown')).toBe('Unknown');
  });
});

describe('getAnchorBadgeLabel', () => {
  it('returns Credential, KYB, Platform for matching types', () => {
    expect(getAnchorBadgeLabel('credential_verified')).toBe('Credential');
    expect(getAnchorBadgeLabel('kyb_verified')).toBe('KYB');
    expect(getAnchorBadgeLabel('platform_verified')).toBe('Platform');
    expect(getAnchorBadgeLabel('platform_verified', 'stripe')).toBe('Stripe Verified');
    expect(getAnchorBadgeLabel('domain_verified')).toBe('Platform');
    expect(getAnchorBadgeLabel('other')).toBe(null);
  });
});
