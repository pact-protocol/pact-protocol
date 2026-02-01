import { useState } from 'react';
import type { AuditorPackData } from '../types';
import { getVerdictSummaryLine } from '../lib/integrity';
import './VerifyLocally.css';

interface VerifyLocallyProps {
  /** Path for verify command: e.g. "packs/auditor_pack_success.zip" (demo) or original filename (drag-drop) */
  packVerifyPath?: string;
  /** Pack data when a pack is loaded; used for verdict summary line */
  packData?: AuditorPackData | null;
}

export default function VerifyLocally({ packVerifyPath, packData }: VerifyLocallyProps) {
  const [copied, setCopied] = useState(false);
  const command = `pact-verifier auditor-pack-verify --zip ${packVerifyPath || '<pack_path>'}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const verdictLine = packData ? getVerdictSummaryLine(packData) : null;

  return (
    <div className="verify-locally">
      <h3 className="verify-title">Verify this pack locally (offline):</h3>
      <p className="verify-readonly">This viewer is read-only. Verification must be done with the CLI.</p>
      <div className="verify-command-box">
        <code className="verify-command">{command}</code>
        <button className="copy-button" onClick={handleCopy}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      {verdictLine && (
        <div className="verdict-summary-block">
          <div className="verdict-summary-label">Verdict Summary</div>
          <div className="verdict-summary-line" title="One-line verdict from this pack">
            {verdictLine}
          </div>
        </div>
      )}
    </div>
  );
}
