/**
 * Anchor onboarding API: proxies issue requests to the Pact Registry.
 * Keeps REGISTRY_API_KEY server-side. Supports demo (issue-demo) and production (Stripe Connect, OIDC).
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env from app dir, then repo root (for monorepo)
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });
config({ path: resolve(__dirname, '../../../.env') });

import express from 'express';
import { createHash } from 'node:crypto';

const app = express();
app.use(express.json({ limit: '16kb' }));

const REGISTRY_URL = (process.env.REGISTRY_URL || 'http://localhost:3100').replace(/\/$/, '');
const REGISTRY_API_KEY = process.env.REGISTRY_API_KEY || 'dev-api-key';
const PORT = Number(process.env.ONBOARDING_SERVER_PORT) || 3043;

// Production integrations (env-gated)
const STRIPE_CLIENT_ID = process.env.STRIPE_CLIENT_ID || '';
const STRIPE_CLIENT_SECRET = process.env.STRIPE_CLIENT_SECRET || '';
const STRIPE_CONNECT_REDIRECT_URI = process.env.STRIPE_CONNECT_REDIRECT_URI || '';
const OIDC_ISSUER = process.env.OIDC_ISSUER || '';
const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID || '';
const OIDC_JWKS_URI = process.env.OIDC_JWKS_URI || '';
const stripeConnectEnabled = Boolean(
  STRIPE_CLIENT_ID && STRIPE_CLIENT_SECRET && STRIPE_CONNECT_REDIRECT_URI
);
const oidcEnabled = Boolean(OIDC_ISSUER && OIDC_JWKS_URI);

// CORS: allow the Vite dev origin
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (origin.startsWith('http://localhost:') || origin.startsWith('https://'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/** Demo Stripe fingerprint: sha256 of "demo-stripe-" + subject pubkey (no real Stripe ID). */
function demoAccountIdFingerprint(subjectPubkey) {
  const hash = createHash('sha256').update('demo-stripe-' + subjectPubkey, 'utf8').digest('hex');
  return 'sha256:' + hash;
}

/**
 * POST /api/issue-demo
 * Body: { subject_signer_public_key_b58: string, display_name?: string }
 * Issues a platform_verified (Stripe) anchor with a demo fingerprint for testing.
 */
app.post('/api/issue-demo', async (req, res) => {
  try {
    const { subject_signer_public_key_b58, display_name } = req.body || {};
    if (!subject_signer_public_key_b58 || typeof subject_signer_public_key_b58 !== 'string') {
      return res.status(400).json({ error: 'subject_signer_public_key_b58 is required' });
    }
    const subject = String(subject_signer_public_key_b58).trim();
    const fingerprint = demoAccountIdFingerprint(subject);

    const issueBody = {
      subject_signer_public_key_b58: subject,
      anchor_type: 'platform_verified',
      verification_method: 'stripe',
      display_name: display_name && String(display_name).trim() ? String(display_name).trim() : undefined,
      payload: {
        platform: 'stripe',
        account_type: 'merchant',
        account_id_fingerprint: fingerprint,
        scope: ['payments'],
        region: 'US',
      },
    };

    const regRes = await fetch(`${REGISTRY_URL}/v1/anchors/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': REGISTRY_API_KEY,
      },
      body: JSON.stringify(issueBody),
    });

    const data = await regRes.json().catch(() => ({}));
    if (!regRes.ok) {
      return res.status(regRes.status).json({ error: data.error || 'Registry request failed', details: data });
    }
    return res.status(201).json({ ok: true, anchor: data.anchor_attestation || data });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }
});

/**
 * GET /api/anchors/:pubkey
 * Proxies to registry GET /v1/anchors/by-subject/:pubkey.
 * Returns { anchors: [...] } (Boxer-shaped).
 */
app.get('/api/anchors/:pubkey', async (req, res) => {
  try {
    const pubkey = req.params.pubkey;
    if (!pubkey) return res.status(400).json({ error: 'pubkey is required' });
    const regRes = await fetch(`${REGISTRY_URL}/v1/anchors/by-subject/${encodeURIComponent(pubkey)}`, {
      method: 'GET',
      headers: { 'x-api-key': REGISTRY_API_KEY },
    });
    const data = await regRes.json().catch(() => ({}));
    if (!regRes.ok) {
      return res.status(regRes.status).json({ error: data.error || 'Registry request failed', details: data });
    }
    return res.json({ anchors: data.anchors ?? [] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }
});

/**
 * POST /api/revoke
 * Body: { anchor_id: string, reason?: string, revoked_at_ms?: number }
 * Proxies to registry POST /v1/anchors/revoke.
 */
app.post('/api/revoke', async (req, res) => {
  try {
    const { anchor_id, reason, revoked_at_ms } = req.body || {};
    if (!anchor_id || typeof anchor_id !== 'string') {
      return res.status(400).json({ error: 'anchor_id is required' });
    }
    const body = { anchor_id: String(anchor_id).trim() };
    if (reason != null) body.reason = String(reason);
    if (revoked_at_ms != null) body.revoked_at_ms = Number(revoked_at_ms) || undefined;

    const regRes = await fetch(`${REGISTRY_URL}/v1/anchors/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': REGISTRY_API_KEY,
      },
      body: JSON.stringify(body),
    });

    const data = await regRes.json().catch(() => ({}));
    if (!regRes.ok) {
      return res.status(regRes.status).json({ error: data.error || 'Registry request failed', details: data });
    }
    return res.json(data);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }
});

/**
 * GET /api/config
 * Returns registry URL, API key status, and production integration flags.
 */
app.get('/api/config', (req, res) => {
  res.json({
    registryUrl: REGISTRY_URL,
    hasApiKey: Boolean(REGISTRY_API_KEY && REGISTRY_API_KEY.length > 0),
    stripeConnectEnabled,
    oidcEnabled,
  });
});

/**
 * GET /api/stripe/connect
 * Query: subject (required), return_url (required), display_name (optional)
 * Returns redirect URL for Stripe Connect OAuth. Only available when STRIPE_CLIENT_ID + STRIPE_CLIENT_SECRET + STRIPE_CONNECT_REDIRECT_URI are set.
 */
app.get('/api/stripe/connect', (req, res) => {
  if (!stripeConnectEnabled) {
    return res.status(503).json({ error: 'Stripe Connect not configured. Set STRIPE_CLIENT_ID, STRIPE_CLIENT_SECRET, STRIPE_CONNECT_REDIRECT_URI.' });
  }
  const subject = (req.query.subject || '').toString().trim();
  const returnUrl = (req.query.return_url || '').toString().trim();
  if (!subject || !returnUrl) {
    return res.status(400).json({ error: 'subject and return_url query params are required' });
  }
  const state = Buffer.from(JSON.stringify({ subject, return_url: returnUrl }), 'utf8').toString('base64url');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: STRIPE_CLIENT_ID,
    scope: 'read_write',
    redirect_uri: STRIPE_CONNECT_REDIRECT_URI,
    state,
  });
  const redirectUrl = `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
  res.json({ redirect_url: redirectUrl });
});

/**
 * GET /api/stripe/callback
 * Query: code (from Stripe), state (base64url JSON: { subject, return_url })
 * Exchanges code for connected account ID, hashes to fingerprint, issues platform_verified anchor, redirects to return_url.
 */
app.get('/api/stripe/callback', async (req, res) => {
  if (!stripeConnectEnabled) {
    return res.status(503).json({ error: 'Stripe Connect not configured.' });
  }
  const code = req.query.code;
  const stateRaw = req.query.state;
  if (!code || !stateRaw) {
    return res.status(400).json({ error: 'code and state are required' });
  }
  let state;
  try {
    state = JSON.parse(Buffer.from(stateRaw, 'base64url').toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid state' });
  }
  const { subject, return_url } = state;
  if (!subject || !return_url) {
    return res.status(400).json({ error: 'Invalid state: subject and return_url required' });
  }

  try {
    const tokenRes = await fetch('https://connect.stripe.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_secret: STRIPE_CLIENT_SECRET,
      }),
    });
    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok) {
      const err = tokenData.error_description || tokenData.error || 'Stripe token exchange failed';
      const url = new URL(return_url);
      url.searchParams.set('error', err);
      return res.redirect(url.toString());
    }
    const accountId = tokenData.stripe_user_id;
    if (!accountId || (typeof accountId === 'string' && !accountId.startsWith('acct_'))) {
      const url = new URL(return_url);
      url.searchParams.set('error', 'No connected account ID from Stripe');
      return res.redirect(url.toString());
    }
    const fingerprint = 'sha256:' + createHash('sha256').update(accountId, 'utf8').digest('hex');
    const issueBody = {
      subject_signer_public_key_b58: subject,
      anchor_type: 'platform_verified',
      verification_method: 'stripe',
      payload: {
        platform: 'stripe',
        account_type: 'merchant',
        account_id_fingerprint: fingerprint,
        scope: ['payments'],
        region: 'US',
      },
    };
    const regRes = await fetch(`${REGISTRY_URL}/v1/anchors/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': REGISTRY_API_KEY },
      body: JSON.stringify(issueBody),
    });
    const regData = await regRes.json().catch(() => ({}));
    const url = new URL(return_url);
    if (!regRes.ok) {
      url.searchParams.set('error', regData.error || regData.details?.error || 'Registry issue failed');
      return res.redirect(url.toString());
    }
    const anchorId = regData.anchor_attestation?.anchor_id || regData.anchor_id;
    if (anchorId) url.searchParams.set('anchor_id', anchorId);
    url.searchParams.set('success', '1');
    res.redirect(url.toString());
  } catch (e) {
    console.error(e);
    const url = new URL(return_url);
    url.searchParams.set('error', e.message || 'Server error');
    res.redirect(url.toString());
  }
});

/**
 * POST /api/oidc/verify
 * Body: { id_token: string, subject_signer_public_key_b58?: string }
 * Validates id_token via OIDC JWKS, returns assertion_fingerprint and payload for oidc_verified anchor.
 * Only available when OIDC_ISSUER and OIDC_JWKS_URI are set. Requires optional peerDep: jose.
 */
app.post('/api/oidc/verify', async (req, res) => {
  if (!oidcEnabled) {
    return res.status(503).json({ error: 'OIDC not configured. Set OIDC_ISSUER and OIDC_JWKS_URI.' });
  }
  const { id_token } = req.body || {};
  if (!id_token || typeof id_token !== 'string') {
    return res.status(400).json({ error: 'id_token is required' });
  }
  let jose;
  try {
    jose = await import('jose');
  } catch {
    return res.status(503).json({ error: 'OIDC verification requires the jose package. Run: pnpm add jose' });
  }
  try {
    const JWKS = jose.createRemoteJWKSet(new URL(OIDC_JWKS_URI));
    const { payload } = await jose.jwtVerify(id_token, JWKS, {
      issuer: OIDC_ISSUER,
      audience: OIDC_CLIENT_ID || undefined,
    });
    const rawToken = id_token;
    const fingerprint = 'sha256:' + createHash('sha256').update(rawToken, 'utf8').digest('hex');
    const oidcPayload = {
      issuer: payload.iss || OIDC_ISSUER,
      subject: payload.sub || '',
      assertion_fingerprint: fingerprint,
      ...(payload.aud && { audience: Array.isArray(payload.aud) ? payload.aud[0] : payload.aud }),
      ...(payload.email && { email: payload.email }),
      scope: payload.scope ? (Array.isArray(payload.scope) ? payload.scope : [payload.scope]) : ['oidc'],
    };
    res.json({
      ok: true,
      assertion_fingerprint: fingerprint,
      payload: oidcPayload,
      subject: payload.sub,
    });
  } catch (e) {
    console.error('OIDC verify:', e.message);
    return res.status(400).json({ error: e.message || 'Invalid or expired id_token' });
  }
});

/**
 * POST /api/issue
 * Forwards full issuance body to REGISTRY_URL/v1/anchors/issue. No server-side base58 validation of payload.
 */
app.post('/api/issue', async (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Request body must be a JSON object' });
    }
    if (!body.subject_signer_public_key_b58 || typeof body.subject_signer_public_key_b58 !== 'string') {
      return res.status(400).json({ error: 'subject_signer_public_key_b58 is required' });
    }

    const regRes = await fetch(`${REGISTRY_URL}/v1/anchors/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': REGISTRY_API_KEY,
      },
      body: JSON.stringify(body),
    });

    const data = await regRes.json().catch(() => ({}));
    if (!regRes.ok) {
      return res.status(regRes.status).json({ error: data.error || 'Registry request failed', details: data });
    }
    return res.status(regRes.status === 201 ? 201 : 200).json(data);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'anchor-onboarding-api' });
});

app.listen(PORT, () => {
  console.log(`Anchor onboarding API http://localhost:${PORT} (registry: ${REGISTRY_URL})`);
});
