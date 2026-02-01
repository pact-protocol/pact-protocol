import CopyVerifyCommandButton from './CopyVerifyCommandButton';
import './ReadOnlyBanner.css';

interface ReadOnlyBannerProps {
  /** Path for verify command: e.g. "packs/auditor_pack_success.zip" (demo) or original filename (drag-drop) */
  packVerifyPath?: string;
}

export default function ReadOnlyBanner({ packVerifyPath }: ReadOnlyBannerProps) {
  return (
    <div className="read-only-banner">
      <div className="banner-header">
        <h2 className="banner-title">Read-Only Evidence Viewer</h2>
        {packVerifyPath && (
          <CopyVerifyCommandButton packVerifyPath={packVerifyPath} variant="banner" />
        )}
      </div>
      <p className="banner-text">
        Source of truth is the Auditor Pack ZIP. This viewer does not execute transactions.
      </p>
      <div className="banner-verification">
        <span className="verification-label">Verify this pack locally (offline):</span>
        <p className="verification-readonly">This viewer is read-only. Verification must be done with the CLI.</p>
        <code className="verification-command">
          pact-verifier auditor-pack-verify --zip {packVerifyPath || '<file>'}
        </code>
      </div>
      <p className="banner-note">
        All outputs are derived from signed transcripts and a fixed Constitution hash.
      </p>
    </div>
  );
}
