# Run Production Flows Locally

This guide walks through running **Stripe Connect**, **OIDC verification**, and the **Evidence Viewer ↔ Onboarding** deep link on your machine.

---

## Prerequisites

- Pact repo cloned and built
- Node 20+, pnpm 8+

```bash
pnpm install
pnpm -C packages/registry build
pnpm -C packages/verifier build
```

---

## 1. Registry (required for issuance)

```bash
# Generate keys (once)
pnpm -C packages/registry gen:keys

# Copy output to .env.registry at repo root
cp design_partner_bundle/.env.registry.example .env.registry
# Edit .env.registry and paste REGISTRY_ISSUER_PUBLIC_KEY_B58, REGISTRY_ISSUER_SECRET_KEY_B58

# Start registry
PORT=3100 pnpm -C packages/registry start
```

Leave this running in a terminal.

---

## 2. Onboarding (UI + API)

```bash
# Copy env template
cp apps/anchor-onboarding/.env.example apps/anchor-onboarding/.env

# Edit apps/anchor-onboarding/.env — at minimum:
# REGISTRY_URL=http://localhost:3100
# REGISTRY_API_KEY=dev-api-key
# (Optional) Add Stripe Connect / OIDC vars for production flows (see below)

# Start onboarding (UI + API together)
pnpm --filter @pact/anchor-onboarding dev:all
```

Open **http://localhost:5175**. The server loads `.env` automatically.

---

## 3. Evidence Viewer (with onboarding link)

```bash
# Copy env template
cp apps/evidence-viewer/.env.example apps/evidence-viewer/.env

# Edit apps/evidence-viewer/.env:
# VITE_ANCHOR_ONBOARDING_URL=http://localhost:5175  # or 5176 if that's the port your onboarding app uses

# Start viewer
pnpm --filter @pact/evidence-viewer dev
```

Open the URL Vite prints (e.g. http://localhost:5173). Load a pack, open a party modal → "Anchor onboarding" or "Manage anchors" should link to onboarding with `?pubkey=...` prefilled.

**Troubleshooting:** If the link opens the Evidence Viewer instead of the onboarding app, `VITE_ANCHOR_ONBOARDING_URL` is wrong. It must be the onboarding URL (e.g. port 5175 or 5176), not the viewer URL (5173). Check `apps/evidence-viewer/.env`.

---

## 4. Stripe Connect (production flow)

**One-time setup in Stripe Dashboard:**

1. Go to [Stripe Connect Settings](https://dashboard.stripe.com/settings/connect)
2. Copy your **Client ID** (`ca_...`)
3. Under **Redirect URIs**, add: `http://localhost:3043/api/stripe/callback`

**In `apps/anchor-onboarding/.env`:**

```env
STRIPE_CLIENT_ID=ca_...
STRIPE_CLIENT_SECRET=sk_...
STRIPE_CONNECT_REDIRECT_URI=http://localhost:3043/api/stripe/callback
```

**Run:**

1. Registry running (port 3100)
2. Onboarding running (`pnpm --filter @pact/anchor-onboarding dev:all`)
3. Open http://localhost:5175
4. Enter a subject pubkey (e.g. from a demo pack), click **Load anchors**
5. In **Issue Anchor** tab, click **Connect with Stripe**
6. Authorize on Stripe → you’re redirected back → anchor is issued
7. Click **Load anchors** to refresh the table

---

## 5. OIDC Verification (production flow)

You need an IdP that issues JWTs (Okta, Auth0, etc.) and its JWKS URL.

**In `apps/anchor-onboarding/.env`:**

```env
OIDC_ISSUER=https://your-issuer.example.com
OIDC_JWKS_URI=https://your-issuer.example.com/.well-known/jwks.json
OIDC_CLIENT_ID=your-client-id   # optional, for audience validation
```

**Run:**

1. Registry running, onboarding running
2. Open http://localhost:5175
3. Enter subject pubkey, go to **Issue Anchor** tab
4. In the OIDC section, paste your `id_token` (JWT) from your IdP
5. Click **Verify OIDC token** → payload is prefilled
6. Adjust display name if needed, click **Issue anchor**

---

## Quick reference: terminals

| Terminal | Command |
|----------|---------|
| 1 | `PORT=3100 pnpm -C packages/registry start` |
| 2 | `pnpm --filter @pact/anchor-onboarding dev:all` |
| 3 | `pnpm --filter @pact/evidence-viewer dev` |

---

## Test subject pubkey

From the API success pack:

```bash
unzip -p design_partner_bundle/packs/auditor_pack_api_success.zip input/transcript.json | node -e "
const chunks=[];process.stdin.on('data',d=>chunks.push(d));
process.stdin.on('end',()=>{
  const d=JSON.parse(Buffer.concat(chunks).toString());
  const ask=(d.rounds||[]).find(r=>(r.round_type||'').toUpperCase()==='ASK');
  console.log(ask?.public_key_b58||ask?.signature?.signer_public_key_b58||'');
});
"
```

Or use the INTENT signer (buyer) by changing `ASK` to `INTENT`.
