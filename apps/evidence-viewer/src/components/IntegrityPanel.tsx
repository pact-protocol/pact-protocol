import type { GCView, MerkleDigest, IntegrityResult, AuditorPackData } from '../types';
import CopyVerifyCommandButton from './CopyVerifyCommandButton';
import { truncateHash } from '../lib/loadPack';
import { getIntegrityStatus, getIntegrityStatusForPack } from '../lib/integrity';
import './Panel.css';

interface IntegrityPanelProps {
  gcView: GCView;
  packFileName?: string;
  /** Path for verify command (demo: packs/<file>.zip; drag-drop: original filename) */
  packVerifyPath?: string;
  /** Optional Merkle digest (Evidence plane); additive anchor only */
  merkleDigest?: MerkleDigest | null;
  /** @deprecated Packs do not contain pack_verify; use integrityResult */
  packVerifyResult?: unknown;
  /** Client-side integrity from pack contents (preferred) */
  integrityResult?: IntegrityResult | null;
  /** When provided, integrity is taken from pack (integrityResult preferred) */
  packData?: AuditorPackData | null;
}

export default function IntegrityPanel({ gcView, packFileName, packVerifyPath, merkleDigest, packVerifyResult, integrityResult, packData }: IntegrityPanelProps) {
  const { hash_chain, signatures_verified, final_hash_validation, notes } = gcView.integrity;

  const integrityStatus = packData
    ? getIntegrityStatusForPack(packData)
    : (integrityResult?.status ?? getIntegrityStatus(packVerifyResult ?? undefined));
  const isTampered = integrityStatus === 'TAMPERED';

  const checksums = integrityResult?.checksums;
  const hashChain = integrityResult?.hashChain ?? { status: hash_chain as 'VALID' | 'INVALID', details: undefined };
  const sigResult = integrityResult?.signatures ?? {
    status: (signatures_verified.verified === signatures_verified.total ? 'VALID' : 'INVALID') as 'VALID' | 'INVALID' | 'UNVERIFIABLE',
    verifiedCount: signatures_verified.verified,
    totalCount: signatures_verified.total,
    failures: [] as string[],
  };
  const sigDisplay = `${sigResult.verifiedCount}/${sigResult.totalCount} verified`;

  return (
    <div className="panel integrity-panel">
      <div className="panel-title-row">
        <h2 className="panel-title">INTEGRITY</h2>
        {packVerifyPath && (
          <CopyVerifyCommandButton packVerifyPath={packVerifyPath} variant="panel" />
        )}
      </div>
      {isTampered && (
        <div className="tamper-warning">
          <strong>⚠️ TAMPER DETECTED:</strong> This pack failed integrity verification. Evidence may be compromised.
        </div>
      )}
      <div className="panel-content">
        {checksums != null && (
          <>
            <div className="integrity-item">
              <span className="integrity-label">Checksums:</span>
              <span className={`integrity-badge ${checksums.status === 'VALID' ? 'valid' : checksums.status === 'INVALID' ? 'invalid' : 'neutral'}`}>
                {checksums.status}
              </span>
              {checksums.totalCount > 0 && (
                <span className="integrity-value"> ({checksums.checkedCount}/{checksums.totalCount} checked)</span>
              )}
            </div>
            {checksums.failures.length > 0 && (
              <ul className="integrity-failures">
                {checksums.failures.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            )}
          </>
        )}
        <div className="integrity-item">
          <span className="integrity-label">Hash Chain:</span>
          <span className={`integrity-badge ${hashChain.status === 'VALID' ? 'valid' : 'invalid'}`}>
            {hashChain.status}
          </span>
        </div>
        {hashChain.details && (
          <p className="integrity-detail">{hashChain.details}</p>
        )}
        <div className="integrity-item">
          <span className="integrity-label">Signatures:</span>
          <span className={`integrity-badge ${sigResult.status === 'VALID' ? 'valid' : sigResult.status === 'INVALID' ? 'invalid' : 'neutral'}`}>
            {sigResult.status}
          </span>
          <span className="integrity-value"> {sigDisplay}</span>
        </div>
        {sigResult.failures.length > 0 && (
          <ul className="integrity-failures">
            {sigResult.failures.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        )}
        {!integrityResult && (
          <div className="integrity-item">
            <span className="integrity-label">Final Hash:</span>
            <span className={`integrity-badge ${final_hash_validation === 'MATCH' ? 'valid' : 'invalid'}`}>
              {final_hash_validation}
            </span>
          </div>
        )}
        {integrityResult?.warnings && integrityResult.warnings.length > 0 && (
          <div className="integrity-warnings-section">
            <div className="warnings-group-label">Warnings &amp; Exceptions</div>
            <p className="warnings-disclaimer">Warnings are informational only. They do not affect the Integrity verdict (e.g. claimed vs computed transcript hash mismatch appears here, not as tamper).</p>
            <ul className="integrity-failures">
              {integrityResult.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        {notes && notes.length > 0 && (
          <div className="integrity-notes">
            <div className="notes-label">Notes:</div>
            <ul>
              {notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </div>
        )}
        {merkleDigest && (
          <div className="merkle-digest-section">
            <div className="merkle-digest-label">Merkle digest (Evidence plane)</div>
            <div className="merkle-digest-note">
              Extra anchor only; not used as verification instead of PoN.
            </div>
            <div className="integrity-item">
              <span className="integrity-label">Date (UTC):</span>
              <span className="integrity-value">{merkleDigest.date_utc}</span>
            </div>
            <div className="integrity-item">
              <span className="integrity-label">Root:</span>
              <span className="integrity-value monospace">{truncateHash(merkleDigest.root, 20)}</span>
            </div>
            <div className="integrity-item">
              <span className="integrity-label">Leaf index:</span>
              <span className="integrity-value">{merkleDigest.leaf_index} / {merkleDigest.tree_size}</span>
            </div>
            {merkleDigest.constitution_hash != null && (
              <div className="integrity-item">
                <span className="integrity-label">Constitution hash:</span>
                <span className="integrity-value monospace">{truncateHash(merkleDigest.constitution_hash, 16)}</span>
              </div>
            )}
            {merkleDigest.signer != null && (
              <div className="integrity-item">
                <span className="integrity-label">Signer:</span>
                <span className="integrity-value monospace">{truncateHash(merkleDigest.signer, 12)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
