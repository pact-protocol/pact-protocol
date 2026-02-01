import type { AuditorPackData } from '../types';
import { getWarningsAndExceptions } from '../lib/integrity';
import './Panel.css';

interface WarningsAndExceptionsPanelProps {
  packData: AuditorPackData;
}

export default function WarningsAndExceptionsPanel({ packData }: WarningsAndExceptionsPanelProps) {
  const wa = getWarningsAndExceptions(
    packData.packVerifyResult,
    packData.gcView,
    packData.insurerSummary,
    !!packData.merkleDigest,
    !!packData.replayVerifyResult,
    packData.integrityResult
  );

  const hasAny =
    wa.packIntegrityWarnings.length > 0 ||
    wa.hashMismatches.length > 0 ||
    wa.nonstandardConstitution.length > 0 ||
    wa.missingOptionalArtifacts.length > 0;

  if (!hasAny) return null;

  return (
    <div className="panel warnings-and-exceptions-panel">
      <h2 className="panel-title">WARNINGS & EXCEPTIONS</h2>
      <div className="panel-content">
        <p className="warnings-disclaimer">
          Warnings are informational only. They do not affect the Integrity verdict (e.g. claimed vs computed transcript hash mismatch is shown here, not as tamper).
        </p>

        {wa.packIntegrityWarnings.length > 0 && (
          <div className="warnings-group">
            <div className="warnings-group-label">Pack integrity warnings</div>
            <ul>
              {wa.packIntegrityWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {wa.hashMismatches.length > 0 && (
          <div className="warnings-group">
            <div className="warnings-group-label">Warnings: Claimed vs computed transcript hash</div>
            <ul>
              {wa.hashMismatches.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {wa.nonstandardConstitution.length > 0 && (
          <div className="warnings-group">
            <div className="warnings-group-label">Warnings: Nonstandard constitution</div>
            <ul>
              {wa.nonstandardConstitution.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {wa.missingOptionalArtifacts.length > 0 && (
          <div className="warnings-group">
            <div className="warnings-group-label">Warnings: Missing optional artifacts</div>
            <ul>
              {wa.missingOptionalArtifacts.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
