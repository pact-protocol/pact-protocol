import { useState, useCallback, useMemo } from 'react';
import type { AuditorPackData, PassportSnapshotView } from '../types';
import {
  getTranscriptId,
  getTimestamp,
  getTransactionPurpose,
  getBuyerPubkey,
  getProviderOfRecordPubkey,
  getStatusForDisplay,
  getSettlementAttemptedForDisplay,
  getJudgment,
  getConfidence,
  getIntegritySummary,
  getEconomicDetailsForDisplay,
  getEconomicFootnote,
  getTransactionHash,
  getAttempts,
  getOutcomeInputFromPack,
  summaryTruncate,
} from '../lib/summaryExtract';
import { getMoneyMovedDisplay, MONEY_MOVED_UNTRUSTED_NOTE } from '../lib/moneyMovedDisplay';
import { buildPartyIndex, buildPartiesView } from '../lib/partyIndex';
import PartyCard from './PartyCard';
import { getIntegrityVerdict, getIntegrityVerdictLabel } from '../lib/integrityVerdict';
import {
  classifyOutcome,
  deriveSummaryState,
  getCanonicalExplanation,
  getIntegrityBadge,
  getOutcomeBadge,
  getSummaryExplanationLine,
  isSummaryBlocked,
  isIndeterminate as isIndeterminateState,
} from '../lib/summaryState';
import {
  badgeToneToCssClass,
  getIntegrityBadgeStyle,
  getIntegrityBadgeIcon,
  getIntegrityBadgeModifier,
  getOutcomeBadgeStyle,
  getResponsibilityBadgeStyle,
  getSubcheckStyle,
} from '../lib/badgeSemantics';
import PartyChip from './PartyChip';
import BadgeLegend from './BadgeLegend';

interface SummaryPanelProps {
  packData: AuditorPackData;
  boxerSnapshot?: PassportSnapshotView | null;
  onOpenParty?: (pubkey: string) => void;
}

function CopyChip({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [text]);
  return (
    <span className="summary-chip">
      <code title={text}>{label ?? summaryTruncate(text, 16)}</code>
      <button type="button" className="summary-copy-btn" onClick={handleCopy} title="Copy">
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  );
}

export default function SummaryPanel({ packData, boxerSnapshot, onOpenParty }: SummaryPanelProps) {
  const verdict = getIntegrityVerdict(packData);
  const outcomeInput = getOutcomeInputFromPack(packData);
  const classifiedOutcome = classifyOutcome(outcomeInput);
  const summaryState = deriveSummaryState({
    integrityVerdict: verdict.verdict,
    ...outcomeInput,
  });
  const integrityBadge = getIntegrityBadge(summaryState);
  const outcomeBadgeInfo = getOutcomeBadge(summaryState, classifiedOutcome);
  const explanationLine = getSummaryExplanationLine(summaryState, classifiedOutcome);
  const canonicalExplanation = getCanonicalExplanation(summaryState, classifiedOutcome, verdict.verdict);
  const blocked = isSummaryBlocked(summaryState);
  const isIndeterminate = isIndeterminateState(summaryState);

  const partyIndex = useMemo(() => buildPartyIndex(packData, boxerSnapshot ?? null), [packData, boxerSnapshot]);
  const partiesView = useMemo(
    () => buildPartiesView(partyIndex, packData, boxerSnapshot ?? null),
    [partyIndex, packData, boxerSnapshot]
  );
  const [operationalExpanded, setOperationalExpanded] = useState(false);
  const transcriptId = getTranscriptId(packData);
  const timestamp = getTimestamp(packData);
  const purpose = getTransactionPurpose(packData);
  const buyerPk = getBuyerPubkey(packData);
  const providerPk = getProviderOfRecordPubkey(packData);
  const status = getStatusForDisplay(packData.gcView, verdict.verdict);
  const moneyMovedDisplay = getMoneyMovedDisplay(verdict.verdict, packData.gcView?.executive_summary?.money_moved);
  const moneyMoved = moneyMovedDisplay.value;
  const settlementAttempted = getSettlementAttemptedForDisplay(packData.gcView, verdict.verdict);
  const rawJudgment = getJudgment(packData.judgment, packData.gcView);
  const rawConfidence = getConfidence(packData.judgment, packData.gcView);
  const integrity = getIntegritySummary(packData);
  const economic = getEconomicDetailsForDisplay(packData, verdict.verdict);
  const economicFootnote = getEconomicFootnote(packData, verdict.verdict);
  const txHash = getTransactionHash(packData);
  const attempts = getAttempts(packData);

  const showConfidence = !blocked;
  const confidence = rawConfidence;

  const handleSeeTechnicalVerification = () => {
    const el = document.getElementById('technical-verification');
    el?.scrollIntoView({ behavior: 'smooth' });
    window.dispatchEvent(new CustomEvent('expand-section', { detail: { id: 'technical-verification' } }));
  };
  const statusClass = badgeToneToCssClass(getOutcomeBadgeStyle(status));
  const moneyMovedClass =
    moneyMoved === 'YES' ? 'status-good' : moneyMoved === 'NO' ? 'status-bad' : 'status-warn';
  const settlementClass =
    settlementAttempted === 'YES' ? 'status-good' : settlementAttempted === 'NO' ? 'status-bad' : 'status-warn';
  const integrityClass = badgeToneToCssClass(getIntegrityBadgeStyle(verdict.verdict));
  const judgmentClass = badgeToneToCssClass(getResponsibilityBadgeStyle(rawJudgment ?? null));

  const [transcriptCopied, setTranscriptCopied] = useState(false);
  const copyTranscript = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(transcriptId);
      setTranscriptCopied(true);
      setTimeout(() => setTranscriptCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [transcriptId]);

  return (
    <section className="summary-panel panel" aria-label="Transaction summary">
      <div className="summary-panel-header">
        <h2 className="summary-panel-title">Summary</h2>
        <BadgeLegend />
        <div className="summary-header-badges">
          <div
            className={`summary-integrity-banner ${badgeToneToCssClass(getIntegrityBadgeStyle(verdict.verdict))}${getIntegrityBadgeModifier(verdict.verdict) ? ' summary-integrity-banner-tampered' : ''}`}
            role="status"
            aria-label={`Integrity: ${integrityBadge.label}`}
          >
            <span className={`summary-integrity-icon summary-integrity-icon-${getIntegrityBadgeIcon(verdict.verdict)}`} aria-hidden />
            {integrityBadge.label}
          </div>
          <div
            className={`summary-outcome-badge summary-outcome-badge-secondary ${badgeToneToCssClass(getOutcomeBadgeStyle(outcomeBadgeInfo.label))}`}
            role="status"
            aria-label={`Outcome: ${outcomeBadgeInfo.label}`}
          >
            {outcomeBadgeInfo.label}
          </div>
        </div>
      </div>

      <div className="summary-canonical-explanation" role="status" aria-label="Canonical explanation">
        <p className="summary-canonical-p1">{canonicalExplanation.paragraph1}</p>
        <p className="summary-canonical-p2">{canonicalExplanation.paragraph2}</p>
      </div>

      <p className="summary-explanation" role="status">
        {explanationLine}
      </p>

      {blocked && (
        <div className="summary-warning-banner summary-warning-integrity" role="alert">
          <p>Blocked due to untrusted evidence. Outcome and responsibility are not trustworthy.</p>
          <button type="button" className="summary-see-verification-btn" onClick={handleSeeTechnicalVerification}>
            See Technical Verification
          </button>
        </div>
      )}
      {isIndeterminate && (
        <div className="summary-indeterminate-banner" role="status">
          Integrity indeterminate; conclusions may be incomplete.
        </div>
      )}

      <div className="summary-sections">
        {/* Transaction Identity: row 1 = Transcript ID + Timestamp, row 2 = Purpose, row 3 = Transaction Hash */}
        <div className="summary-section-card">
          <h3 className="summary-section-title">Transaction Identity</h3>
          <div className="summary-identity-layout">
            <div className="summary-section-grid summary-section-cols-2">
              <div className="summary-field">
                <span className="summary-field-label">Transcript ID</span>
                <span className="summary-field-value summary-field-copyable">
                  <code title={transcriptId}>{summaryTruncate(transcriptId, 32)}</code>
                  <button type="button" className="summary-copy-btn" onClick={copyTranscript} title="Copy">
                    {transcriptCopied ? 'Copied' : 'Copy'}
                  </button>
                </span>
              </div>
              <div className="summary-field">
                <span className="summary-field-label">Timestamp</span>
                <span className="summary-field-value">{timestamp}</span>
              </div>
            </div>
            {txHash.hash && (
              <div className="summary-section-grid summary-identity-row2">
                <div className="summary-field">
                  <span className="summary-field-label">Transaction Hash</span>
                  <span className="summary-field-value summary-field-copyable" title="Stable identifier for this transaction record.">
                    <CopyChip text={txHash.hash} label={summaryTruncate(txHash.hash, 24)} />
                    {txHash.isFallback && <span className="summary-fallback-label">(fallback)</span>}
                  </span>
                </div>
              </div>
            )}
            <div className="summary-section-grid summary-identity-row2">
              <div className="summary-field">
                <span className="summary-field-label">Transaction purpose</span>
                <span className="summary-field-value">{purpose}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Parties: unified cards — Buyer, Provider, Experts, Operational Agents (no duplicates) */}
        <div className="summary-section-card">
          <h3 className="summary-section-title">Parties</h3>
          <div className="summary-parties-unified">
            {/* Primary: Buyer and Provider as cards */}
            <div className="summary-parties-primary">
              {partiesView.primary[0] && (
                <div className="summary-parties-primary-card">
                  <h4 className="contributors-section-title">Buyer</h4>
                  <PartyCard viewModel={partiesView.primary[0].viewModel} onOpenParty={onOpenParty} />
                </div>
              )}
              {partiesView.primary[1] && (
                <div className="summary-parties-primary-card">
                  <h4 className="contributors-section-title">Provider</h4>
                  <PartyCard viewModel={partiesView.primary[1].viewModel} onOpenParty={onOpenParty} />
                </div>
              )}
              {!partiesView.primary[0] && !partiesView.primary[1] && (
                <p className="summary-unknown">Not present in this pack</p>
              )}
            </div>
            {/* Experts */}
            {partiesView.experts.length > 0 && (
              <>
                <h4 className="contributors-section-title">Experts</h4>
                <div className="contributors-cards contributors-cards-experts">
                  {partiesView.experts.map((vm) => (
                    <PartyCard key={vm.pubkey} viewModel={vm} onOpenParty={onOpenParty} />
                  ))}
                </div>
              </>
            )}
            {/* Operational Agents */}
            {partiesView.operational.length > 0 && (
              <div className="contributors-section contributors-operational">
                <h4
                  className="contributors-section-title contributors-operational-toggle"
                  role="button"
                  tabIndex={0}
                  onClick={() => setOperationalExpanded((e) => !e)}
                  onKeyDown={(e) => e.key === 'Enter' && setOperationalExpanded((prev) => !prev)}
                  aria-expanded={operationalExpanded}
                  aria-controls="contributors-operational-list"
                >
                  Operational Agents ({partiesView.operational.length})
                </h4>
                <div
                  id="contributors-operational-list"
                  className="contributors-cards contributors-cards-operational"
                  hidden={!operationalExpanded}
                >
                  {partiesView.operational.map((vm) => (
                    <PartyCard key={vm.pubkey} viewModel={vm} onOpenParty={onOpenParty} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {blocked ? (
          <p className="summary-hidden-note">Hidden due to untrusted evidence.</p>
        ) : (
          <>
            {/* Result */}
            <div className="summary-section-card">
              <h3 className="summary-section-title">Result</h3>
              <div className="summary-section-grid summary-section-cols-4">
                <div className="summary-field">
                  <span className="summary-field-label">Status</span>
                  <span className={`summary-badge ${statusClass}`} title={isIndeterminate ? 'Integrity indeterminate; treat downstream fields with caution.' : undefined}>
                    {status}
                  </span>
                </div>
                <div className="summary-field">
                  <span className="summary-field-label">Money moved</span>
                  <span className={`summary-field-value summary-status ${moneyMovedClass}`}>{moneyMoved}</span>
                  {moneyMovedDisplay.showUntrustedNote && (
                    <p className="summary-money-moved-untrusted-note" role="status">{MONEY_MOVED_UNTRUSTED_NOTE}</p>
                  )}
                </div>
                <div className="summary-field">
                  <span className="summary-field-label">Settlement attempted</span>
                  <span className={`summary-field-value summary-status ${settlementClass}`}>{settlementAttempted}</span>
                </div>
                <div className="summary-field">
                  <span className="summary-field-label">Attempts</span>
                  <span className="summary-field-value">{attempts.display}</span>
                </div>
              </div>
            </div>

            {/* Responsibility */}
            <div className="summary-section-card">
              <h3 className="summary-section-title">Responsibility</h3>
              <div className="summary-section-grid summary-section-cols-2 summary-section-responsibility">
                <div className="summary-field">
                  <span className="summary-field-label">Judgment</span>
                  <span className={`summary-badge ${judgmentClass}`}>{rawJudgment}</span>
                </div>
                <div className="summary-field summary-field-confidence">
                  <span className="summary-field-label">Confidence</span>
                  <div className="summary-confidence-wrap">
                    <div className="summary-confidence-bar">
                      <div className="summary-confidence-fill" style={{ width: `${confidence}%` }} />
                    </div>
                    <span className="summary-confidence-pct">{Math.round(confidence)}%</span>
                  </div>
                </div>
              </div>
            </div>
            {/* Economic snapshot (when not blocked) */}
            <div className="summary-section-card">
              <h3 className="summary-section-title">Economic snapshot</h3>
              <div className="summary-economic-layout">
                <div className="summary-section-grid summary-section-cols-4">
                  <div className="summary-field">
                    <span className="summary-field-label">Asset</span>
                    <span className="summary-field-value">{economic.asset}</span>
                  </div>
                  <div className="summary-field">
                    <span className="summary-field-label">Amount</span>
                    <span className="summary-field-value">{economic.amount}</span>
                  </div>
                  <div className="summary-field">
                    <span className="summary-field-label">From</span>
                    <span className="summary-field-value">
                      {onOpenParty && buyerPk ? (
                        <PartyChip pubkey={buyerPk} label={economic.from} onOpenParty={onOpenParty} truncateLen={12} />
                      ) : (
                        <span>{economic.from}</span>
                      )}
                    </span>
                  </div>
                  <div className="summary-field">
                    <span className="summary-field-label">To</span>
                    <span className="summary-field-value">
                      {onOpenParty && providerPk ? (
                        <PartyChip pubkey={providerPk} label={economic.to} onOpenParty={onOpenParty} truncateLen={12} />
                      ) : (
                        <span>{economic.to}</span>
                      )}
                    </span>
                  </div>
                </div>
                <div className="summary-section-grid summary-economic-row2">
                  <div className="summary-field">
                    <span className="summary-field-label">Settlement rail</span>
                    <span className="summary-field-value">{economic.rail}</span>
                  </div>
                  <div className="summary-field">
                    <span className="summary-field-label">Reference</span>
                    <span className="summary-field-value">
                      {economic.reference && economic.reference.length > 32 ? (
                        <code title={economic.reference}>{summaryTruncate(economic.reference, 24)}</code>
                      ) : (
                        economic.reference ?? '—'
                      )}
                    </span>
                  </div>
                </div>
                {economicFootnote && (
                  <p className="summary-economic-footnote">{economicFootnote}</p>
                )}
              </div>
            </div>
          </>
        )}

        {/* Integrity (derived verdict + subchecks; VERIFIED only when all pass) */}
        <div className="summary-section-card">
          <h3 className="summary-section-title">Integrity</h3>
          <div className="summary-section-grid summary-section-cols-5">
            <div className="summary-field">
              <span className="summary-field-label">Integrity</span>
              <span className={`summary-badge ${integrityClass}`}>{getIntegrityVerdictLabel(verdict.verdict)}</span>
            </div>
            <div className="summary-field">
              <span className="summary-field-label">Signatures</span>
              <span className="summary-field-value">{integrity.signatures}</span>
            </div>
            <div className="summary-field">
              <span className="summary-field-label">Hash chain</span>
              <span className={`summary-field-value summary-status ${badgeToneToCssClass(getSubcheckStyle(integrity.hashChain ?? ''))}`}>{integrity.hashChain}</span>
            </div>
            {integrity.checksums != null && (
              <div className="summary-field">
                <span className="summary-field-label">Checksums</span>
                <span className={`summary-field-value summary-status ${badgeToneToCssClass(getSubcheckStyle(integrity.checksums ?? ''))}`}>{integrity.checksums}</span>
              </div>
            )}
            {integrity.recompute != null && (
              <div className="summary-field">
                <span className="summary-field-label">Recompute</span>
                <span className={`summary-field-value summary-status ${integrity.recompute === 'OK' ? 'status-good' : 'status-bad'}`}>{integrity.recompute}</span>
              </div>
            )}
          </div>
        </div>

      </div>
    </section>
  );
}
