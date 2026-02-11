/**
 * Unit tests for Summary state machine: classification, state derivation, badges, field display.
 * Golden tests: state and badges from canonical packs (when packs exist on disk).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import {
  SummaryState,
  classifyOutcome,
  deriveSummaryState,
  getCanonicalExplanation,
  getIntegrityBadge,
  getOutcomeBadge,
  getFieldDisplay,
  getSummaryExplanationLine,
  isSummaryBlocked,
  isIndeterminate,
  type IntegrityVerdictKind,
} from '../summaryState';
import { loadPackFromFile } from '../loadPack';
import { getIntegrityVerdict } from '../integrityVerdict';
import { getOutcomeInputFromPack } from '../summaryExtract';
import { getPackPath, packExists } from '../__fixtures__/packPaths';

describe('classifyOutcome', () => {
  it('a) outcomeCode: COMPLETED => COMPLETED', () => {
    expect(classifyOutcome({ outcomeCode: 'COMPLETED' })).toBe('COMPLETED');
    expect(classifyOutcome({ outcomeCode: 'COMPLETED', settlementAttempted: false })).toBe('COMPLETED');
  });

  it('a) outcomeCode: ABORT* => ABORTED', () => {
    expect(classifyOutcome({ outcomeCode: 'ABORTED_POLICY' })).toBe('ABORTED');
    expect(classifyOutcome({ outcomeCode: 'ABORTED_KYA' })).toBe('ABORTED');
  });

  it('a) outcomeCode: FAILED_PROVIDER_UNREACHABLE / FAILED_TIMEOUT => TIMEOUT', () => {
    expect(classifyOutcome({ outcomeCode: 'FAILED_PROVIDER_UNREACHABLE' })).toBe('TIMEOUT');
    expect(classifyOutcome({ outcomeCode: 'FAILED_TIMEOUT' })).toBe('TIMEOUT');
  });

  it('a) outcomeCode: other FAILED* => FAILED', () => {
    expect(classifyOutcome({ outcomeCode: 'FAILED' })).toBe('FAILED');
    expect(classifyOutcome({ outcomeCode: 'FAILED_INTEGRITY' })).toBe('FAILED');
  });

  it('b) failureCode: PACT-101/202/303 => ABORTED', () => {
    expect(classifyOutcome({ outcomeCode: null, failureCode: 'PACT-101' })).toBe('ABORTED');
    expect(classifyOutcome({ outcomeCode: null, failureCode: 'PACT-202' })).toBe('ABORTED');
    expect(classifyOutcome({ outcomeCode: null, failureCode: 'PACT-303' })).toBe('ABORTED');
  });

  it('b) failureCode: PACT-404/420 => TIMEOUT', () => {
    expect(classifyOutcome({ outcomeCode: null, failureCode: 'PACT-420' })).toBe('TIMEOUT');
    expect(classifyOutcome({ outcomeCode: null, failureCode: 'PACT-404' })).toBe('TIMEOUT');
  });

  it('b) failureCode: other PACT-* => FAILED', () => {
    expect(classifyOutcome({ outcomeCode: null, failureCode: 'PACT-421' })).toBe('FAILED');
  });

  it('c) settlement flags: settlementAttempted=false => ABORTED', () => {
    expect(classifyOutcome({ settlementAttempted: false, moneyMoved: false })).toBe('ABORTED');
  });

  it('c) settlement flags: attempted + moneyMoved => COMPLETED', () => {
    expect(classifyOutcome({ settlementAttempted: true, moneyMoved: true })).toBe('COMPLETED');
  });

  it('c) settlement flags: attempted + !moneyMoved => FAILED', () => {
    expect(classifyOutcome({ settlementAttempted: true, moneyMoved: false })).toBe('FAILED');
  });

  it('d) fallback => UNKNOWN', () => {
    expect(classifyOutcome({})).toBe('UNKNOWN');
    expect(classifyOutcome({ outcomeCode: null, failureCode: null, settlementAttempted: null, moneyMoved: null })).toBe('UNKNOWN');
  });
});

describe('deriveSummaryState', () => {
  it('VERIFIED + outcomeCode COMPLETED => TRUSTED_COMPLETED', () => {
    const state = deriveSummaryState({
      integrityVerdict: 'VERIFIED',
      outcomeCode: 'COMPLETED',
      failureCode: null,
      settlementAttempted: true,
      moneyMoved: true,
    });
    expect(state).toBe(SummaryState.TRUSTED_COMPLETED);
  });

  it('VERIFIED + failureCode PACT-101 => TRUSTED_ABORTED', () => {
    const state = deriveSummaryState({
      integrityVerdict: 'VERIFIED',
      outcomeCode: null,
      failureCode: 'PACT-101',
      settlementAttempted: null,
      moneyMoved: null,
    });
    expect(state).toBe(SummaryState.TRUSTED_ABORTED);
  });

  it('VERIFIED + failureCode PACT-420 => TRUSTED_TIMEOUT', () => {
    const state = deriveSummaryState({
      integrityVerdict: 'VERIFIED',
      outcomeCode: null,
      failureCode: 'PACT-420',
      settlementAttempted: true,
      moneyMoved: false,
    });
    expect(state).toBe(SummaryState.TRUSTED_TIMEOUT);
  });

  it('INVALID => UNTRUSTED_INVALID', () => {
    const state = deriveSummaryState({
      integrityVerdict: 'INVALID',
      outcomeCode: 'COMPLETED',
      failureCode: null,
      settlementAttempted: true,
      moneyMoved: true,
    });
    expect(state).toBe(SummaryState.UNTRUSTED_INVALID);
  });

  it('TAMPERED => UNTRUSTED_TAMPERED', () => {
    const state = deriveSummaryState({
      integrityVerdict: 'TAMPERED',
      outcomeCode: 'COMPLETED',
      failureCode: null,
      settlementAttempted: true,
      moneyMoved: true,
    });
    expect(state).toBe(SummaryState.UNTRUSTED_TAMPERED);
  });

  it('INDETERMINATE => INDETERMINATE', () => {
    const state = deriveSummaryState({
      integrityVerdict: 'INDETERMINATE',
      outcomeCode: null,
      failureCode: null,
      settlementAttempted: null,
      moneyMoved: null,
    });
    expect(state).toBe(SummaryState.INDETERMINATE);
  });

  it('VERIFIED + no signals => TRUSTED_UNKNOWN', () => {
    const state = deriveSummaryState({
      integrityVerdict: 'VERIFIED',
      outcomeCode: null,
      failureCode: null,
      settlementAttempted: null,
      moneyMoved: null,
    });
    expect(state).toBe(SummaryState.TRUSTED_UNKNOWN);
  });
});

describe('getIntegrityBadge', () => {
  it('TRUSTED_* => VERIFIED, good', () => {
    expect(getIntegrityBadge(SummaryState.TRUSTED_COMPLETED)).toEqual({ label: 'VERIFIED', tone: 'good' });
    expect(getIntegrityBadge(SummaryState.TRUSTED_ABORTED)).toEqual({ label: 'VERIFIED', tone: 'good' });
    expect(getIntegrityBadge(SummaryState.TRUSTED_TIMEOUT)).toEqual({ label: 'VERIFIED', tone: 'good' });
  });

  it('INDETERMINATE => INDETERMINATE, warn', () => {
    expect(getIntegrityBadge(SummaryState.INDETERMINATE)).toEqual({ label: 'INDETERMINATE', tone: 'warn' });
  });

  it('UNTRUSTED_INVALID => INVALID, bad', () => {
    expect(getIntegrityBadge(SummaryState.UNTRUSTED_INVALID)).toEqual({ label: 'INVALID', tone: 'bad' });
  });

  it('UNTRUSTED_TAMPERED => TAMPERED, bad', () => {
    expect(getIntegrityBadge(SummaryState.UNTRUSTED_TAMPERED)).toEqual({ label: 'TAMPERED', tone: 'bad' });
  });
});

describe('getOutcomeBadge', () => {
  it('TRUSTED_COMPLETED => COMPLETED, good', () => {
    expect(getOutcomeBadge(SummaryState.TRUSTED_COMPLETED, 'COMPLETED')).toEqual({ label: 'COMPLETED', tone: 'good' });
  });

  it('TRUSTED_ABORTED => ABORTED, warn', () => {
    expect(getOutcomeBadge(SummaryState.TRUSTED_ABORTED, 'ABORTED')).toEqual({ label: 'ABORTED', tone: 'warn' });
  });

  it('TRUSTED_FAILED => FAILED, bad', () => {
    expect(getOutcomeBadge(SummaryState.TRUSTED_FAILED, 'FAILED')).toEqual({ label: 'FAILED', tone: 'bad' });
  });

  it('TRUSTED_TIMEOUT => TIMEOUT, warn', () => {
    expect(getOutcomeBadge(SummaryState.TRUSTED_TIMEOUT, 'TIMEOUT')).toEqual({ label: 'TIMEOUT', tone: 'warn' });
  });

  it('TRUSTED_UNKNOWN => UNKNOWN, muted', () => {
    expect(getOutcomeBadge(SummaryState.TRUSTED_UNKNOWN, 'UNKNOWN')).toEqual({ label: 'UNKNOWN', tone: 'muted' });
  });

  it('UNTRUSTED_* => CLAIMED, muted (enforcement: never green/yellow when integrity invalid)', () => {
    expect(getOutcomeBadge(SummaryState.UNTRUSTED_INVALID, 'COMPLETED')).toEqual({ label: 'CLAIMED', tone: 'muted' });
    expect(getOutcomeBadge(SummaryState.UNTRUSTED_TAMPERED, 'ABORTED')).toEqual({ label: 'CLAIMED', tone: 'muted' });
  });

  it('INDETERMINATE => UNAVAILABLE, muted', () => {
    expect(getOutcomeBadge(SummaryState.INDETERMINATE, 'COMPLETED')).toEqual({ label: 'UNAVAILABLE', tone: 'muted' });
  });
});

describe('getFieldDisplay', () => {
  it('UNTRUSTED_* => UNTRUSTED', () => {
    expect(getFieldDisplay(SummaryState.UNTRUSTED_INVALID, 'asset', 'USD')).toEqual({ kind: 'UNTRUSTED', display: 'Untrusted' });
    expect(getFieldDisplay(SummaryState.UNTRUSTED_TAMPERED, 'amount', null)).toEqual({ kind: 'UNTRUSTED', display: 'Untrusted' });
  });

  it('value present => VALUE', () => {
    expect(getFieldDisplay(SummaryState.TRUSTED_COMPLETED, 'asset', 'USD')).toEqual({ kind: 'VALUE', display: 'USD' });
    expect(getFieldDisplay(SummaryState.TRUSTED_ABORTED, 'amount', '100')).toEqual({ kind: 'VALUE', display: '100' });
  });

  it('TRUSTED_ABORTED + reference missing => NOT_APPLICABLE', () => {
    expect(getFieldDisplay(SummaryState.TRUSTED_ABORTED, 'reference', null)).toEqual({ kind: 'NOT_APPLICABLE', display: 'Not applicable' });
    expect(getFieldDisplay(SummaryState.TRUSTED_ABORTED, 'settlement_reference', '')).toEqual({ kind: 'NOT_APPLICABLE', display: 'Not applicable' });
  });

  it('verified + missing => NOT_RECORDED', () => {
    expect(getFieldDisplay(SummaryState.TRUSTED_COMPLETED, 'asset', null)).toEqual({ kind: 'NOT_RECORDED', display: 'Not recorded' });
    expect(getFieldDisplay(SummaryState.TRUSTED_COMPLETED, 'amount', '')).toEqual({ kind: 'NOT_RECORDED', display: 'Not recorded' });
  });
});

describe('getSummaryExplanationLine', () => {
  it('TRUSTED_* includes outcome', () => {
    expect(getSummaryExplanationLine(SummaryState.TRUSTED_COMPLETED, 'COMPLETED')).toContain('Evidence verified');
    expect(getSummaryExplanationLine(SummaryState.TRUSTED_COMPLETED, 'COMPLETED')).toContain('COMPLETED');
  });

  it('UNTRUSTED_INVALID message', () => {
    expect(getSummaryExplanationLine(SummaryState.UNTRUSTED_INVALID, 'COMPLETED')).toBe('This pack failed verification. Outcome and responsibility are untrusted.');
  });

  it('UNTRUSTED_TAMPERED message', () => {
    expect(getSummaryExplanationLine(SummaryState.UNTRUSTED_TAMPERED, 'COMPLETED')).toBe('This pack was altered after signing. Do not rely on outcome or responsibility.');
  });

  it('INDETERMINATE message', () => {
    expect(getSummaryExplanationLine(SummaryState.INDETERMINATE, 'COMPLETED')).toContain('Integrity indeterminate');
    expect(getSummaryExplanationLine(SummaryState.INDETERMINATE, 'COMPLETED')).toContain('may be incomplete');
  });
});

describe('isSummaryBlocked / isIndeterminateState', () => {
  it('UNTRUSTED_* => blocked', () => {
    expect(isSummaryBlocked(SummaryState.UNTRUSTED_INVALID)).toBe(true);
    expect(isSummaryBlocked(SummaryState.UNTRUSTED_TAMPERED)).toBe(true);
  });

  it('TRUSTED_* and INDETERMINATE => not blocked', () => {
    expect(isSummaryBlocked(SummaryState.TRUSTED_COMPLETED)).toBe(false);
    expect(isSummaryBlocked(SummaryState.INDETERMINATE)).toBe(false);
  });

  it('INDETERMINATE => indeterminate', () => {
    expect(isIndeterminate(SummaryState.INDETERMINATE)).toBe(true);
    expect(isIndeterminate(SummaryState.TRUSTED_COMPLETED)).toBe(false);
  });
});

describe('badge combinations (acceptance)', () => {
  it('VERIFIED + COMPLETED => badges VERIFIED + COMPLETED', () => {
    const state = deriveSummaryState({ integrityVerdict: 'VERIFIED', outcomeCode: 'COMPLETED', failureCode: null, settlementAttempted: true, moneyMoved: true });
    expect(state).toBe(SummaryState.TRUSTED_COMPLETED);
    expect(getIntegrityBadge(state).label).toBe('VERIFIED');
    expect(getOutcomeBadge(state, 'COMPLETED').label).toBe('COMPLETED');
  });

  it('VERIFIED + PACT-101 => VERIFIED + ABORTED', () => {
    const state = deriveSummaryState({ integrityVerdict: 'VERIFIED', outcomeCode: null, failureCode: 'PACT-101', settlementAttempted: null, moneyMoved: null });
    expect(state).toBe(SummaryState.TRUSTED_ABORTED);
    expect(getIntegrityBadge(state).label).toBe('VERIFIED');
    expect(getOutcomeBadge(state, 'ABORTED').label).toBe('ABORTED');
  });

  it('VERIFIED + PACT-420 => VERIFIED + TIMEOUT', () => {
    const state = deriveSummaryState({ integrityVerdict: 'VERIFIED', outcomeCode: null, failureCode: 'PACT-420', settlementAttempted: null, moneyMoved: null });
    expect(state).toBe(SummaryState.TRUSTED_TIMEOUT);
    expect(getIntegrityBadge(state).label).toBe('VERIFIED');
    expect(getOutcomeBadge(state, 'TIMEOUT').label).toBe('TIMEOUT');
  });

  it('INVALID => INVALID + CLAIMED (muted)', () => {
    const state = deriveSummaryState({ integrityVerdict: 'INVALID', outcomeCode: 'COMPLETED', failureCode: null, settlementAttempted: true, moneyMoved: true });
    expect(state).toBe(SummaryState.UNTRUSTED_INVALID);
    expect(getIntegrityBadge(state).label).toBe('INVALID');
    expect(getOutcomeBadge(state, 'COMPLETED')).toEqual({ label: 'CLAIMED', tone: 'muted' });
  });

  it('TAMPERED => TAMPERED + CLAIMED (muted)', () => {
    const state = deriveSummaryState({ integrityVerdict: 'TAMPERED', outcomeCode: 'COMPLETED', failureCode: null, settlementAttempted: true, moneyMoved: true });
    expect(state).toBe(SummaryState.UNTRUSTED_TAMPERED);
    expect(getIntegrityBadge(state).label).toBe('TAMPERED');
    expect(getOutcomeBadge(state, 'COMPLETED')).toEqual({ label: 'CLAIMED', tone: 'muted' });
  });
});

describe('getCanonicalExplanation', () => {
  it('SUCCESS: completed + trust outcome and evidence', () => {
    const r = getCanonicalExplanation(SummaryState.TRUSTED_COMPLETED, 'COMPLETED', 'VERIFIED');
    expect(r.paragraph1).toBe('This transaction completed successfully and all cryptographic integrity checks passed.');
    expect(r.paragraph2).toBe('Pact can trust the outcome, responsibility attribution, and supporting evidence.');
  });
  it('ABORTED (101): policy violation, no funds transferred', () => {
    const r = getCanonicalExplanation(SummaryState.TRUSTED_ABORTED, 'ABORTED', 'VERIFIED');
    expect(r.paragraph1).toBe('This transaction was aborted due to a policy violation before settlement.');
    expect(r.paragraph2).toBe('Pact can trust the evidence and responsibility attribution, but no funds were transferred.');
  });
  it('420/TIMEOUT: provider unreachable, no settlement', () => {
    const r = getCanonicalExplanation(SummaryState.TRUSTED_TIMEOUT, 'TIMEOUT', 'VERIFIED');
    expect(r.paragraph1).toBe('The transaction could not complete because the provider was unreachable.');
    expect(r.paragraph2).toBe('Pact can verify signed intent and attempts, but no settlement occurred.');
  });
  it('TAMPERED: bundle altered, outcomes untrusted', () => {
    const r = getCanonicalExplanation(SummaryState.UNTRUSTED_TAMPERED, 'COMPLETED', 'TAMPERED');
    expect(r.paragraph1).toBe('This evidence bundle was altered after signing.');
    expect(r.paragraph2).toBe('Pact can verify individual signatures, but outcomes and responsibility are untrusted.');
  });
});

/** Golden tests: derive state and badges from canonical packs (when packs exist on disk). */
describe('Golden: state and badges from canonical packs', () => {
  function fileFromPath(filePath: string, name: string): File {
    const buf = readFileSync(filePath);
    return new File([buf], name, { type: 'application/zip' });
  }

  it('success pack => TRUSTED_COMPLETED, VERIFIED + COMPLETED', { timeout: 15000 }, async () => {
    if (!packExists('success')) return;
    const path = getPackPath('success');
    const pack = await loadPackFromFile(fileFromPath(path, 'auditor_pack_success.zip'));
    const verdict = getIntegrityVerdict(pack).verdict as IntegrityVerdictKind;
    const outcomeInput = getOutcomeInputFromPack(pack);
    const classifiedOutcome = classifyOutcome(outcomeInput);
    const state = deriveSummaryState({ integrityVerdict: verdict, ...outcomeInput });
    expect(state).toBe(SummaryState.TRUSTED_COMPLETED);
    expect(getIntegrityBadge(state).label).toBe('VERIFIED');
    expect(getOutcomeBadge(state, classifiedOutcome).label).toBe('COMPLETED');
  });

  it('101 pack => TRUSTED_ABORTED, VERIFIED + ABORTED', { timeout: 15000 }, async () => {
    if (!packExists('abort101')) return;
    const path = getPackPath('abort101');
    const pack = await loadPackFromFile(fileFromPath(path, 'auditor_pack_101.zip'));
    const verdict = getIntegrityVerdict(pack).verdict as IntegrityVerdictKind;
    const outcomeInput = getOutcomeInputFromPack(pack);
    const classifiedOutcome = classifyOutcome(outcomeInput);
    const state = deriveSummaryState({ integrityVerdict: verdict, ...outcomeInput });
    expect(state).toBe(SummaryState.TRUSTED_ABORTED);
    expect(getIntegrityBadge(state).label).toBe('VERIFIED');
    expect(getOutcomeBadge(state, classifiedOutcome).label).toBe('ABORTED');
  });

  it('420 pack => TRUSTED_TIMEOUT when VERIFIED, else untrusted', { timeout: 15000 }, async () => {
    if (!packExists('timeout420')) return;
    const path = getPackPath('timeout420');
    const pack = await loadPackFromFile(fileFromPath(path, 'auditor_pack_420.zip'));
    const verdict = getIntegrityVerdict(pack).verdict as IntegrityVerdictKind;
    const outcomeInput = getOutcomeInputFromPack(pack);
    const classifiedOutcome = classifyOutcome(outcomeInput);
    const state = deriveSummaryState({ integrityVerdict: verdict, ...outcomeInput });
    if (verdict === 'VERIFIED') {
      expect(state).toBe(SummaryState.TRUSTED_TIMEOUT);
      expect(getIntegrityBadge(state).label).toBe('VERIFIED');
      expect(getOutcomeBadge(state, classifiedOutcome).label).toBe('TIMEOUT');
    } else {
      expect([SummaryState.UNTRUSTED_INVALID, SummaryState.UNTRUSTED_TAMPERED]).toContain(state);
      expect(getOutcomeBadge(state, classifiedOutcome)).toEqual({ label: 'CLAIMED', tone: 'muted' });
    }
  });

  it('tamper pack => UNTRUSTED_TAMPERED, TAMPERED + CLAIMED (muted)', { timeout: 15000 }, async () => {
    if (!packExists('tamper')) return;
    const path = getPackPath('tamper');
    const pack = await loadPackFromFile(fileFromPath(path, 'auditor_pack_semantic_tampered.zip'));
    const verdict = getIntegrityVerdict(pack).verdict as IntegrityVerdictKind;
    const outcomeInput = getOutcomeInputFromPack(pack);
    const classifiedOutcome = classifyOutcome(outcomeInput);
    const state = deriveSummaryState({ integrityVerdict: verdict, ...outcomeInput });
    expect(state).toBe(SummaryState.UNTRUSTED_TAMPERED);
    expect(getIntegrityBadge(state).label).toBe('TAMPERED');
    expect(getOutcomeBadge(state, classifiedOutcome)).toEqual({ label: 'CLAIMED', tone: 'muted' });
  });

  it('invalid (mocked) => UNTRUSTED_INVALID, INVALID + CLAIMED (muted)', () => {
    const state = deriveSummaryState({
      integrityVerdict: 'INVALID',
      outcomeCode: 'COMPLETED',
      failureCode: null,
      settlementAttempted: true,
      moneyMoved: true,
    });
    expect(state).toBe(SummaryState.UNTRUSTED_INVALID);
    expect(getIntegrityBadge(state).label).toBe('INVALID');
    expect(getOutcomeBadge(state, 'COMPLETED')).toEqual({ label: 'CLAIMED', tone: 'muted' });
  });
});
