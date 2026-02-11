import { useState, useCallback, useEffect } from 'react';
import { getPubkeyFromQuery } from './lib/querystring';
import {
  ANCHOR_TYPES,
  VERIFICATION_METHODS,
  getPayloadTemplate,
  parsePayloadJson,
} from './lib/payloadTemplates';

const API_BASE =
  typeof import.meta.env.VITE_ONBOARDING_API_URL === 'string' &&
  import.meta.env.VITE_ONBOARDING_API_URL.trim()
    ? import.meta.env.VITE_ONBOARDING_API_URL.trim().replace(/\/$/, '')
    : '';

function api(path: string, options?: RequestInit) {
  return fetch(`${API_BASE || ''}${path}`, options);
}

type AnchorRow = {
  anchor_id: string;
  anchor_type?: string;
  display_name?: string;
  verification_method?: string;
  issuer_public_key_b58?: string;
  issued_at_ms?: number;
  revoked?: boolean;
  reason?: string;
  revoked_at_ms?: number;
  [k: string]: unknown;
};

function shortPubkey(pk: string | undefined): string {
  if (!pk) return '—';
  return pk.length <= 12 ? pk : `${pk.slice(0, 6)}…${pk.slice(-4)}`;
}

function formatIssuedAt(ms: number | undefined): string {
  if (ms == null) return '—';
  try {
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return String(ms);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return String(ms);
  }
}

function CopyButton({
  text,
  label = 'Copy',
  ariaLabel = 'Copy',
}: {
  text: string;
  label?: string;
  ariaLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [text]);
  return (
    <button
      type="button"
      className="onboarding-copy-btn"
      onClick={handleCopy}
      title="Copy"
      aria-label={ariaLabel}
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

const BOXER_CMD_PLACEHOLDER = `pnpm boxer:recompute --in /tmp/packs_api_only --anchors /tmp/anchors.json --out /tmp/passport.json`;

export default function App() {
  const [pubkey, setPubkey] = useState('');
  const [anchors, setAnchors] = useState<AnchorRow[] | null>(null);
  const [anchorsLoading, setAnchorsLoading] = useState(false);
  const [anchorsError, setAnchorsError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [issueAnchorType, setIssueAnchorType] = useState<string>(ANCHOR_TYPES[0]);
  const [issueVerificationMethod, setIssueVerificationMethod] = useState<string>(VERIFICATION_METHODS[0]);
  const [issueDisplayName, setIssueDisplayName] = useState('');
  const [issuePayloadRaw, setIssuePayloadRaw] = useState(
    () => JSON.stringify(getPayloadTemplate(ANCHOR_TYPES[0]), null, 2)
  );
  const [issueEvidenceRefs, setIssueEvidenceRefs] = useState('');
  const [issueLoading, setIssueLoading] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);

  const [revokeAnchorId, setRevokeAnchorId] = useState('');
  const [revokeReason, setRevokeReason] = useState('');
  const [revokeShowAdvanced, setRevokeShowAdvanced] = useState(false);
  const [revokeAtMs, setRevokeAtMs] = useState('');
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'issue' | 'revoke'>('issue');

  const [config, setConfig] = useState<{
    stripeConnectEnabled?: boolean;
    oidcEnabled?: boolean;
  }>({});
  const [oidcToken, setOidcToken] = useState('');
  const [oidcVerifyLoading, setOidcVerifyLoading] = useState(false);
  const [oidcVerifyError, setOidcVerifyError] = useState<string | null>(null);

  useEffect(() => {
    setPubkey((prev) => prev || getPubkeyFromQuery());
  }, []);

  useEffect(() => {
    api('/api/config')
      .then((r) => r.json())
      .then((data) => setConfig({ stripeConnectEnabled: data.stripeConnectEnabled, oidcEnabled: data.oidcEnabled }))
      .catch(() => {});
  }, []);

  // Handle Stripe callback return (success=1 or error in URL)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const anchorId = params.get('anchor_id');
    const error = params.get('error');
    if (success === '1') {
      setBanner({ type: 'success', text: anchorId ? `Stripe anchor issued: ${anchorId.slice(0, 12)}…` : 'Stripe anchor issued.' });
      setTimeout(() => setBanner(null), 5000);
      const key = pubkey.trim() || getPubkeyFromQuery();
      window.history.replaceState({}, '', window.location.pathname + (key ? `?pubkey=${encodeURIComponent(key)}` : ''));
    } else if (error) {
      setBanner({ type: 'error', text: decodeURIComponent(error) });
      setTimeout(() => setBanner(null), 8000);
      const key = pubkey.trim() || getPubkeyFromQuery();
      window.history.replaceState({}, '', window.location.pathname + (key ? `?pubkey=${encodeURIComponent(key)}` : ''));
    }
  }, [pubkey]);

  const payloadParse = parsePayloadJson(issuePayloadRaw);
  const payloadValid = payloadParse.ok;
  const payloadValue = payloadParse.ok ? payloadParse.value : {};

  useEffect(() => {
    setIssuePayloadRaw(JSON.stringify(getPayloadTemplate(issueAnchorType), null, 2));
  }, [issueAnchorType]);

  const fetchAnchors = useCallback(async () => {
    const key = pubkey.trim();
    if (!key) return;
    setAnchorsError(null);
    setAnchorsLoading(true);
    try {
      const res = await api(`/api/anchors/${encodeURIComponent(key)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAnchorsError(data.error || data.details?.error || `Request failed (${res.status})`);
        setAnchors(null);
        return;
      }
      setAnchors(Array.isArray(data.anchors) ? data.anchors : []);
    } catch (err) {
      setAnchorsError(err instanceof Error ? err.message : 'Network error');
      setAnchors(null);
    } finally {
      setAnchorsLoading(false);
    }
  }, [pubkey]);

  const handleDownloadAnchors = useCallback(async () => {
    const key = pubkey.trim();
    if (!key) return;
    try {
      const res = await api(`/api/anchors/${encodeURIComponent(key)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAnchorsError(data.error || data.details?.error || `Request failed (${res.status})`);
        return;
      }
      const list = Array.isArray(data.anchors) ? data.anchors : [];
      const blob = new Blob([JSON.stringify({ anchors: list }, null, 2)], {
        type: 'application/json',
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'anchors.json';
      a.click();
      URL.revokeObjectURL(a.href);
      setAnchors(list);
      setAnchorsError(null);
      setBanner({ type: 'success', text: 'Downloaded anchors.json' });
      setTimeout(() => setBanner(null), 4000);
    } catch (err) {
      setBanner({ type: 'error', text: err instanceof Error ? err.message : 'Network error' });
    }
  }, [pubkey]);

  const handleCopyBoxerCommand = useCallback(() => {
    const cmd = BOXER_CMD_PLACEHOLDER;
    navigator.clipboard.writeText(cmd).then(
      () => {
        setBanner({ type: 'success', text: 'Boxer command copied to clipboard' });
        setTimeout(() => setBanner(null), 3000);
      },
      () => setBanner({ type: 'error', text: 'Copy failed' })
    );
  }, []);

  const handleIssue = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIssueError(null);
      const key = pubkey.trim();
      if (!key) {
        setIssueError('Subject public key is required.');
        return;
      }
      if (!payloadValid) {
        setIssueError('Fix payload JSON before submitting.');
        return;
      }
      setIssueLoading(true);
      try {
        const body: Record<string, unknown> = {
          subject_signer_public_key_b58: key,
          anchor_type: issueAnchorType,
          verification_method: issueVerificationMethod,
          payload: payloadValue,
        };
        if (issueDisplayName.trim()) body.display_name = issueDisplayName.trim();
        const refs = issueEvidenceRefs
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (refs.length > 0) body.evidence_refs = refs;

        const res = await api('/api/issue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setIssueError(data.error || data.details?.error || `Request failed (${res.status})`);
          return;
        }
        setBanner({ type: 'success', text: 'Anchor issued. Refreshing list.' });
        setTimeout(() => setBanner(null), 3000);
        await fetchAnchors();
      } catch (err) {
        setIssueError(err instanceof Error ? err.message : 'Network error');
      } finally {
        setIssueLoading(false);
      }
    },
    [
      pubkey,
      issueAnchorType,
      issueVerificationMethod,
      issueDisplayName,
      issueEvidenceRefs,
      payloadValid,
      payloadValue,
      fetchAnchors,
    ]
  );

  const handleRevoke = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setRevokeError(null);
      if (!revokeAnchorId.trim()) {
        setRevokeError('Anchor ID is required.');
        return;
      }
      setRevokeLoading(true);
      try {
        const body: { anchor_id: string; reason?: string; revoked_at_ms?: number } = {
          anchor_id: revokeAnchorId.trim(),
        };
        if (revokeReason.trim()) body.reason = revokeReason.trim();
        if (revokeShowAdvanced && revokeAtMs.trim()) {
          const ms = Number(revokeAtMs.trim());
          if (!Number.isNaN(ms)) body.revoked_at_ms = ms;
        } else {
          body.revoked_at_ms = Date.now();
        }

        const res = await api('/api/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setRevokeError(data.error || data.details?.error || `Request failed (${res.status})`);
          return;
        }
        setBanner({ type: 'success', text: 'Anchor revoked. List refreshed.' });
        setTimeout(() => setBanner(null), 3000);
        setRevokeAnchorId('');
        setRevokeReason('');
        if (anchors !== null) await fetchAnchors();
      } catch (err) {
        setRevokeError(err instanceof Error ? err.message : 'Network error');
      } finally {
        setRevokeLoading(false);
      }
    },
    [revokeAnchorId, revokeReason, revokeShowAdvanced, revokeAtMs, anchors, fetchAnchors]
  );

  const hasPubkey = pubkey.trim().length > 0;

  return (
    <div className="onboarding-app">
      <header className="onboarding-app-header">
        <div className="onboarding-app-header-inner">
          <h1>pact<span className="onboarding-title-underscore">_</span> Onboarding</h1>
          <p className="onboarding-app-subtitle">
            Issue and revoke anchors, export anchors.json for Boxer. Use the Evidence Viewer party modal to open this page with the party pubkey prefilled.
          </p>
        </div>
      </header>

      <main className="onboarding-app-main">
        <div className="onboarding-container">
      {banner && (
        <div
          className={banner.type === 'success' ? 'onboarding-success onboarding-success-banner' : 'onboarding-error'}
          role="status"
        >
          {banner.text}
        </div>
      )}

      <section className="onboarding-section">
        <h2 className="onboarding-section-title">Subject</h2>
        <div className="onboarding-form">
          <label className="onboarding-label" htmlFor="pubkey">
            Public key (Base58)
          </label>
          <div className="onboarding-input-row">
            <input
              id="pubkey"
              className="onboarding-input"
              type="text"
              placeholder="e.g. DCi6DFQteG5nfh8WDDTxYsd7yoeB7bJiYErgohRaaUgA"
              value={pubkey}
              onChange={(e) => setPubkey(e.target.value)}
              style={{ flex: 1, minWidth: 0 }}
            />
            <CopyButton text={pubkey} label="Copy" ariaLabel="Copy pubkey" />
          </div>
          <div className="onboarding-load-row">
            <button
              type="button"
              className="onboarding-btn"
              onClick={fetchAnchors}
              disabled={!hasPubkey || anchorsLoading}
            >
              {anchorsLoading ? 'Loading…' : 'Load anchors'}
            </button>
          </div>
        </div>
        {anchorsError && <div className="onboarding-error">{anchorsError}</div>}

        {anchors && (
          <>
            <div className="onboarding-actions-row">
              <button
                type="button"
                className="onboarding-btn onboarding-btn-secondary"
                onClick={handleDownloadAnchors}
                disabled={!hasPubkey}
              >
                Download anchors.json
              </button>
              <button type="button" className="onboarding-btn onboarding-btn-secondary" onClick={handleCopyBoxerCommand}>
                Copy Boxer command
              </button>
            </div>
            <p className="onboarding-note">
              Save your downloaded anchors.json to <code>/tmp/anchors.json</code> before running the Boxer command.
            </p>
            <div className="onboarding-table-wrap">
              <table className="onboarding-table">
                <thead>
                  <tr>
                    <th>anchor_type</th>
                    <th>display_name</th>
                    <th>verification_method</th>
                    <th>issuer (short)</th>
                    <th>issued_at</th>
                    <th>revoked</th>
                    <th>reason</th>
                    <th>anchor_id</th>
                  </tr>
                </thead>
                <tbody>
                  {anchors.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="onboarding-note">
                        No anchors for this subject.
                      </td>
                    </tr>
                  ) : (
                    anchors.map((a) => (
                      <tr key={a.anchor_id}>
                        <td>{a.anchor_type ?? '—'}</td>
                        <td>{a.display_name ?? '—'}</td>
                        <td>{a.verification_method ?? '—'}</td>
                        <td><code>{shortPubkey(a.issuer_public_key_b58)}</code></td>
                        <td>{formatIssuedAt(a.issued_at_ms)}</td>
                        <td>
                          {a.revoked ? (
                            <span className="onboarding-badge onboarding-badge-revoked">Revoked</span>
                          ) : (
                            <span className="onboarding-badge">Active</span>
                          )}
                        </td>
                        <td>{a.revoked && a.reason ? a.reason : '—'}</td>
                        <td>
                          <span className="onboarding-anchor-id-cell">
                            <code title={a.anchor_id}>{shortPubkey(a.anchor_id)}</code>
                            <CopyButton text={a.anchor_id} label="Copy" ariaLabel="Copy anchor ID" />
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="onboarding-section">
        <div className="onboarding-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'issue'}
            className={`onboarding-tab ${activeTab === 'issue' ? 'onboarding-tab-active' : ''}`}
            onClick={() => setActiveTab('issue')}
          >
            Issue Anchor
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'revoke'}
            className={`onboarding-tab ${activeTab === 'revoke' ? 'onboarding-tab-active' : ''}`}
            onClick={() => setActiveTab('revoke')}
          >
            Revoke Anchor
          </button>
        </div>

        {activeTab === 'issue' && (
        <>
        {config.stripeConnectEnabled && hasPubkey && (
          <div className="onboarding-production-flow" style={{ marginBottom: '1rem' }}>
            <p className="onboarding-note">
              <strong>Production:</strong> Connect a real Stripe account to issue a platform_verified anchor with a real account_id_fingerprint.
            </p>
            <button
              type="button"
              className="onboarding-btn onboarding-btn-secondary"
              onClick={async () => {
                const key = pubkey.trim();
                if (!key) return;
                const returnUrl = `${window.location.origin}${window.location.pathname}?pubkey=${encodeURIComponent(key)}`;
                const res = await api(`/api/stripe/connect?subject=${encodeURIComponent(key)}&return_url=${encodeURIComponent(returnUrl)}`);
                const data = await res.json().catch(() => ({}));
                if (data.redirect_url) window.location.href = data.redirect_url;
                else setBanner({ type: 'error', text: data.error || 'Could not get Stripe connect URL' });
              }}
            >
              Connect with Stripe
            </button>
          </div>
        )}
        {config.oidcEnabled && (
          <div className="onboarding-production-flow" style={{ marginBottom: '1rem' }}>
            <p className="onboarding-note">
              <strong>OIDC:</strong> Verify an id_token to get assertion_fingerprint for oidc_verified anchor.
            </p>
            <textarea
              className="onboarding-textarea"
              placeholder="Paste id_token (JWT) here…"
              value={oidcToken}
              onChange={(e) => setOidcToken(e.target.value)}
              rows={2}
              style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
            />
            <button
              type="button"
              className="onboarding-btn onboarding-btn-secondary"
              disabled={oidcVerifyLoading || !oidcToken.trim()}
              onClick={async () => {
                setOidcVerifyError(null);
                setOidcVerifyLoading(true);
                try {
                  const res = await api('/api/oidc/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id_token: oidcToken.trim() }),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    setOidcVerifyError(data.error || 'Verification failed');
                    return;
                  }
                  setIssueAnchorType('oidc_verified');
                  setIssueVerificationMethod('oidc');
                  setIssuePayloadRaw(JSON.stringify(data.payload, null, 2));
                  setOidcToken('');
                  setBanner({ type: 'success', text: 'OIDC verified. Payload prefilled. Issue anchor to complete.' });
                  setTimeout(() => setBanner(null), 4000);
                } catch (err) {
                  setOidcVerifyError(err instanceof Error ? err.message : 'Network error');
                } finally {
                  setOidcVerifyLoading(false);
                }
              }}
            >
              {oidcVerifyLoading ? 'Verifying…' : 'Verify OIDC token'}
            </button>
            {oidcVerifyError && <div className="onboarding-inline-error">{oidcVerifyError}</div>}
          </div>
        )}
        <form className="onboarding-form" onSubmit={handleIssue}>
          <div>
            <label className="onboarding-label" htmlFor="issue_anchor_type">
              anchor_type
            </label>
            <select
              id="issue_anchor_type"
              className="onboarding-input onboarding-select"
              value={issueAnchorType}
              onChange={(e) => setIssueAnchorType(e.target.value)}
            >
              {ANCHOR_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="onboarding-label" htmlFor="issue_verification_method">
              verification_method
            </label>
            <select
              id="issue_verification_method"
              className="onboarding-input onboarding-select"
              value={issueVerificationMethod}
              onChange={(e) => setIssueVerificationMethod(e.target.value)}
            >
              {VERIFICATION_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="onboarding-label" htmlFor="issue_display_name">
              Display name (optional)
            </label>
            <input
              id="issue_display_name"
              className="onboarding-input"
              type="text"
              placeholder="e.g. Acme Data LLC"
              value={issueDisplayName}
              onChange={(e) => setIssueDisplayName(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label className="onboarding-label" htmlFor="issue_payload">
              Payload (JSON object)
            </label>
            <textarea
              id="issue_payload"
              className="onboarding-textarea"
              value={issuePayloadRaw}
              onChange={(e) => setIssuePayloadRaw(e.target.value)}
              rows={10}
              spellCheck={false}
            />
            {!payloadValid && (
              <div className="onboarding-inline-error">
                {!payloadParse.ok && payloadParse.error}
              </div>
            )}
          </div>
          <div>
            <label className="onboarding-label" htmlFor="issue_evidence_refs">
              Evidence refs (optional, comma-separated)
            </label>
            <input
              id="issue_evidence_refs"
              className="onboarding-input"
              type="text"
              placeholder="e.g. stripe:demo:link-001"
              value={issueEvidenceRefs}
              onChange={(e) => setIssueEvidenceRefs(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <button
            type="submit"
            className="onboarding-btn"
            disabled={!hasPubkey || !payloadValid || issueLoading}
          >
            {issueLoading ? 'Issuing…' : 'Issue anchor'}
          </button>
          {issueError && <div className="onboarding-error">{issueError}</div>}
        </form>
        </>
        )}

        {activeTab === 'revoke' && (
        <form className="onboarding-form" onSubmit={handleRevoke}>
          <div>
            <label className="onboarding-label" htmlFor="revoke_anchor_id">
              Anchor ID (required)
            </label>
            <input
              id="revoke_anchor_id"
              className="onboarding-input"
              type="text"
              placeholder="e.g. anchor-..."
              value={revokeAnchorId}
              onChange={(e) => setRevokeAnchorId(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label className="onboarding-label" htmlFor="revoke_reason">
              Reason (optional)
            </label>
            <input
              id="revoke_reason"
              className="onboarding-input"
              type="text"
              placeholder="e.g. Account unlinked"
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <button
              type="button"
              className="onboarding-btn onboarding-btn-secondary"
              onClick={() => setRevokeShowAdvanced((v) => !v)}
            >
              {revokeShowAdvanced ? 'Hide' : 'Show'} advanced (revoked_at_ms)
            </button>
            {revokeShowAdvanced && (
              <div style={{ marginTop: '0.5rem' }}>
                <label className="onboarding-label" htmlFor="revoke_at_ms">
                  revoked_at_ms (optional)
                </label>
                <input
                  id="revoke_at_ms"
                  className="onboarding-input"
                  type="text"
                  placeholder={String(Date.now())}
                  value={revokeAtMs}
                  onChange={(e) => setRevokeAtMs(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
            )}
          </div>
          <button type="submit" className="onboarding-btn" disabled={revokeLoading}>
            {revokeLoading ? 'Revoking…' : 'Revoke anchor'}
          </button>
          {revokeError && <div className="onboarding-error">{revokeError}</div>}
        </form>
        )}
      </section>
        </div>
      </main>
    </div>
  );
}
