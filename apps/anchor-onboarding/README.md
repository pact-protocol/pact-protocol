# Pact Anchor Onboarding (v2)

Canonical **non-terminal** flow for issuing/revoking anchors and exporting **anchors.json** for Boxer. Integrates with the Evidence Viewer (viewer remains read-only; no registry calls inside the viewer).

## What this app does (v2)

- **Subject:** Enter or paste subject public key (Base58). Pubkey is prefilled from `?pubkey=...` when opened from the Evidence Viewer party modal.
- **Load anchors:** Fetches anchors for the subject from the registry; displays a table (anchor_type, display_name, verification_method, issuer, issued_at, revoked, reason, anchor_id with copy).
- **Download anchors.json:** Exports `{ "anchors": [ ... ] }` in the exact order returned (Boxer-shaped). Save to `/tmp/anchors.json` to use with the copied Boxer command.
- **Copy Boxer command:** Copies a ready-to-run command (e.g. `pnpm boxer:recompute --in /tmp/packs_api_only --anchors /tmp/anchors.json --out /tmp/passport.json`). Save your downloaded anchors.json to `/tmp/anchors.json` before running.
- **Issue anchor:** Tab **Issue Anchor**. Choose anchor_type and verification_method, optional display name, editable JSON payload (templates per type), optional evidence_refs. When production env is set: **Connect with Stripe** (platform_verified) or **Verify OIDC token** (oidc_verified). POSTs to `/api/issue`; on success refreshes the anchors list.
- **Revoke anchor:** Tab **Revoke Anchor now**. Anchor ID (required), reason (optional), optional revoked_at_ms (advanced). POSTs to `/api/revoke`; on success refreshes the list and shows a banner.

## Run locally

**1. Registry** (must be running for issue to succeed):

```bash
pnpm -C packages/registry build
# Set REGISTRY_ISSUER_* in .env.registry at repo root if needed
PORT=3100 pnpm -C packages/registry start
```

**2. Onboarding API** (proxies to registry; keeps API key server-side):

```bash
pnpm install
pnpm --filter @pact/anchor-onboarding server
```

Defaults: `http://localhost:3043`, registry at `http://localhost:3100`, API key `dev-api-key`. Override with `REGISTRY_URL`, `REGISTRY_API_KEY`, `ONBOARDING_SERVER_PORT`.

**3. Onboarding UI:**

```bash
pnpm --filter @pact/anchor-onboarding dev
```

Open http://localhost:5175. The Vite dev server proxies `/api` to the onboarding server (port 3043).

**Or run UI + server together:**

```bash
pnpm --filter @pact/anchor-onboarding dev:all
```

## Link from Evidence Viewer

Set `VITE_ANCHOR_ONBOARDING_URL=http://localhost:5175` (or your deployed onboarding URL) in the Evidence Viewer.

- When a party has **no** anchors (or no snapshot), the Passport modal shows: "This key is not attested… go to [Anchor onboarding]." The link **always** includes `?pubkey=<party_pubkey>` so the onboarding UI opens with the pubkey prefilled.
- When a party **has** anchors, a smaller **Manage anchors** link appears near the anchors list (same URL with `?pubkey=...`) so you can revoke or issue quickly.

## v2 flow (end-to-end)

1. **Open Evidence Viewer** → load a pack → open a party (e.g. Provider) → click **Anchor onboarding** or **Manage anchors**. The onboarding UI opens with that party's pubkey in the Subject field.
2. **Issue an anchor** (or use existing). In onboarding: choose anchor_type and verification_method, edit payload JSON if needed, submit. Green banner and anchors list refresh.
3. **Load anchors** → **Download anchors.json** → save it to `/tmp/anchors.json`.
4. **Run Boxer** to recompute a passport snapshot (or copy the command from the UI):
   ```bash
   pnpm boxer:recompute --in /tmp/packs_api_only --anchors /tmp/anchors.json --out /tmp/passport.json
   ```
5. **Upload the snapshot** in the Evidence Viewer (Load Passport Snapshot) and confirm anchor badges appear for the party.

## API (onboarding server)

The server proxies to the Pact Registry (keeps `REGISTRY_API_KEY` server-side).

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/issue-demo` | Issue a demo Stripe (platform_verified) anchor. Body: `{ subject_signer_public_key_b58, display_name? }`. |
| POST | `/api/issue` | Forward full issuance body to registry `POST /v1/anchors/issue`. Body must include `subject_signer_public_key_b58`; payload is passed through (no server-side base58 validation of payload). |
| GET | `/api/anchors/:pubkey` | Fetch all anchors for a subject. Returns `{ anchors: [...] }` (Boxer-shaped). |
| POST | `/api/revoke` | Revoke an anchor. Body: `{ anchor_id, reason?, revoked_at_ms? }`. |
| GET | `/api/config` | Returns `{ registryUrl, hasApiKey, stripeConnectEnabled, oidcEnabled }` for UI (does not expose the key). |
| GET | `/api/health` | Health check. |
| GET | `/api/stripe/connect` | **Production.** Query: `subject`, `return_url`. Returns `{ redirect_url }` for Stripe Connect OAuth. Requires `STRIPE_CLIENT_ID`, `STRIPE_CLIENT_SECRET`, `STRIPE_CONNECT_REDIRECT_URI`. |
| GET | `/api/stripe/callback` | **Production.** Stripe OAuth callback. Exchanges code, issues platform_verified anchor, redirects to `return_url?success=1&anchor_id=...` or `?error=...`. |
| POST | `/api/oidc/verify` | **Production.** Body: `{ id_token }`. Validates JWT via OIDC JWKS, returns `{ assertion_fingerprint, payload }` for oidc_verified anchor. Requires `OIDC_ISSUER`, `OIDC_JWKS_URI`. |

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `REGISTRY_URL` | `http://localhost:3100` | Pact Registry base URL |
| `REGISTRY_API_KEY` | `dev-api-key` | Registry API key (server only) |
| `ONBOARDING_SERVER_PORT` | `3043` | Onboarding API port |
| `VITE_ONBOARDING_API_URL` | (empty = use proxy) | If set, frontend calls this for `/api` instead of same-origin proxy |
| `STRIPE_CLIENT_ID` | — | Stripe Connect client ID (from dashboard). Enables "Connect with Stripe" flow. |
| `STRIPE_CLIENT_SECRET` | — | Stripe Connect client secret. |
| `STRIPE_CONNECT_REDIRECT_URI` | — | Full callback URL, e.g. `http://localhost:3043/api/stripe/callback`. Must match Stripe dashboard. |
| `OIDC_ISSUER` | — | OIDC issuer URL for JWT validation. Enables OIDC verify flow. |
| `OIDC_CLIENT_ID` | — | Optional audience for JWT validation. |
| `OIDC_JWKS_URI` | — | JWKS URL, e.g. `https://issuer.example.com/.well-known/jwks.json`. |

Copy `.env.example` to `.env` and fill in production values.

## Production: Stripe Connect and OIDC

**Stripe Connect (platform_verified):** When `STRIPE_CLIENT_ID`, `STRIPE_CLIENT_SECRET`, and `STRIPE_CONNECT_REDIRECT_URI` are set:

1. UI shows a **Connect with Stripe** button in the Issue tab (when subject is set).
2. User clicks → redirects to Stripe OAuth → user authorizes → callback issues anchor with real `account_id_fingerprint` (sha256 of Stripe account ID).
3. Never logs or stores raw Stripe account IDs; only the fingerprint is sent to the registry.

**OIDC (oidc_verified):** When `OIDC_ISSUER` and `OIDC_JWKS_URI` are set:

1. UI shows an OIDC verify section. User pastes `id_token` (JWT) from their IdP.
2. Server validates via JWKS, computes `assertion_fingerprint` (sha256 of token), returns payload for oidc_verified anchor.
3. User submits the Issue form to complete issuance.

**Deployment:** Run the onboarding server behind your host (same-origin or CORS) and set Evidence Viewer `VITE_ANCHOR_ONBOARDING_URL` to the onboarding app URL.

**Run locally:** See [docs/guides/RUN_PRODUCTION_FLOWS_LOCAL.md](../../docs/guides/RUN_PRODUCTION_FLOWS_LOCAL.md) for step-by-step instructions (Registry, Onboarding, Evidence Viewer, Stripe Connect, OIDC).
