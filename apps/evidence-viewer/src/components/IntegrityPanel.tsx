import { useState, useCallback } from 'react';
import type { GCView, AuditorPackData } from '../types';
import { getBuyerPubkey, getProviderOfRecordPubkey, getRecordHash } from '../lib/summaryExtract';
import { badgeToneToCssClass, getSubcheckStyle, getSignatureBadgeStyle } from '../lib/badgeSemantics';
import PartyChip from './PartyChip';

function truncate(s: string, len: number): string {
  return s.length <= len ? s : s.slice(0, len) + '…';
}

function CopyableId({ value, length = 16 }: { value: string; length?: number }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [value]);
  return (
    <span className="integrity-copy-row">
      <code title={value}>{truncate(value, length)}</code>
      <button type="button" className="copy-btn-inline" onClick={copy} title="Copy">
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  );
}

function roundCountFromTranscript(transcriptJson: string | undefined): number {
  try {
    const t = transcriptJson ? JSON.parse(transcriptJson) : null;
    const rounds = t?.rounds ?? [];
    return Array.isArray(rounds) ? rounds.length : 0;
  } catch {
    return 0;
  }
}

interface IntegrityPanelProps {
  gcView: GCView;
  packFileName?: string;
  merkleDigest?: AuditorPackData['merkleDigest'];
  packData: AuditorPackData;
  onOpenParty?: (pubkey: string) => void;
}

export default function IntegrityPanel({ gcView, packFileName: _packFileName, merkleDigest, packData, onOpenParty }: IntegrityPanelProps) {
  const int = gcView.integrity;
  const ir = packData.integrityResult;
  const packVerify = packData.packVerifyResult as { ok?: boolean; recompute_ok?: boolean; checksums_ok?: boolean; mismatches?: string[] } | undefined;

  const checksumsOk = packVerify?.checksums_ok ?? ir?.checksums?.status === 'VALID';
  const checksumsStatus = checksumsOk ? 'VALID' : packVerify?.checksums_ok === false ? 'INVALID' : 'UNAVAILABLE';
  const checksumFailures = ir?.checksums?.failures ?? [];

  const hashChainStatus = int?.hash_chain ?? '—';
  const hashChainDetails = ir?.hashChain?.details ?? int?.notes?.find((n) => /hash|chain/i.test(n));
  const roundCount = roundCountFromTranscript(packData.transcript);

  const sigVerified = int?.signatures_verified?.verified ?? ir?.signatures?.verifiedCount ?? 0;
  const sigTotal = int?.signatures_verified?.total ?? ir?.signatures?.totalCount ?? 0;

  const recomputeOk = packVerify?.recompute_ok;

  const buyerPk = getBuyerPubkey(packData);
  const providerPk = getProviderOfRecordPubkey(packData);

  const hashChainClass = badgeToneToCssClass(getSubcheckStyle(hashChainStatus === '—' ? '' : hashChainStatus));
  const sigClass = badgeToneToCssClass(getSignatureBadgeStyle(sigVerified, sigTotal));
  const checksumsClass = badgeToneToCssClass(getSubcheckStyle(checksumsStatus));

  return (
    <div id="technical-verification" className="integrity-panel panel">
      <h3>Technical Verification</h3>

      <h4 className="integrity-subheading">Hash Chain</h4>
      <dl className="integrity-meta">
        <dt>Status</dt>
        <dd>
          <span className={`badge ${hashChainClass}`}>
            {hashChainStatus}
          </span>
        </dd>
        {roundCount > 0 && (
          <>
            <dt>Rounds</dt>
            <dd>{roundCount}/{roundCount} hash-linked</dd>
          </>
        )}
        <dt>Algorithm</dt>
        <dd>SHA-256</dd>
        {hashChainDetails && (
          <>
            <dt>Details</dt>
            <dd className="integrity-detail">{hashChainDetails}</dd>
          </>
        )}
      </dl>

      <h4 className="integrity-subheading">Checksums</h4>
      <dl className="integrity-meta">
        <dt>Status</dt>
        <dd>
          <span className={`badge ${checksumsClass}`}>{checksumsStatus}</span>
          {checksumFailures.length > 0 && (
            <ul className="integrity-failures">
              {checksumFailures.map((f, i) => (
                <li key={i} className="status-bad">{f}</li>
              ))}
            </ul>
          )}
        </dd>
      </dl>

      <h4 className="integrity-subheading">Signatures</h4>
      <dl className="integrity-meta">
        <dt>Verified</dt>
        <dd>
          <span className={sigClass}>
            {sigTotal > 0 ? `✓ ${sigVerified}/${sigTotal} (buyer, provider)` : '—'}
          </span>
        </dd>
        {buyerPk && (
          <>
            <dt>Buyer ID</dt>
            <dd>
              {onOpenParty ? (
                <PartyChip pubkey={buyerPk} onOpenParty={onOpenParty} truncateLen={16} />
              ) : (
                <CopyableId value={buyerPk} />
              )}
            </dd>
          </>
        )}
        {providerPk && (
          <>
            <dt>Provider ID</dt>
            <dd>
              {onOpenParty ? (
                <PartyChip pubkey={providerPk} onOpenParty={onOpenParty} truncateLen={16} />
              ) : (
                <CopyableId value={providerPk} />
              )}
            </dd>
          </>
        )}
      </dl>

      {recomputeOk != null && (
        <>
          <h4 className="integrity-subheading">Recompute Status</h4>
          <dl className="integrity-meta">
            <dt>Result</dt>
            <dd>
              <span className={recomputeOk ? 'status-good' : 'status-bad'}>
                {recomputeOk ? '✓ DETERMINISTIC' : 'Failed'}
              </span>
            </dd>
            {recomputeOk && (
              <>
                <dt>Replay</dt>
                <dd className="integrity-detail">All rounds reproduce identical hashes</dd>
              </>
            )}
          </dl>
        </>
      )}

      {(() => {
        const recordHash = getRecordHash(packData);
        if (!recordHash) return null;
        return (
          <>
            <h4 className="integrity-subheading">Record hash</h4>
            <p className="integrity-record-hash">
              <CopyableId value={recordHash} length={32} />
            </p>
          </>
        );
      })()}

      {merkleDigest && (
        <div className="merkle-digest">
          <h4 className="integrity-subheading">Merkle</h4>
          <p>
            Root: <code>{merkleDigest.root?.slice(0, 16)}...</code>
          </p>
        </div>
      )}
    </div>
  );
}
