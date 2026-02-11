# Identity Layer MVP (Pact Registry)

This document describes the Identity Layer MVP: a small **Pact Registry** service and tooling that issues and revokes signed **Anchor Attestations**, binding an agent signing key to real-world identity claims (KYB, credentials, platform identity, service account). The Evidence Viewer and **Boxer** already consume anchors; this MVP makes anchors issuable in a real workflow.

**Non-goals:** No marketplace, no user-accounts UI, no payments, no on-chain registry. No storing sensitive KYB documents in packs. Verification is **offline-first** (no network required).

**Boxer vs Registry vs Viewer:** **Boxer** is Pact’s passport-snapshot component: it takes an auditor pack + an anchors file and produces a *derived* snapshot (entities, anchor badges, recommendations). It does not verify packs and does not issue anchors. The **Registry** issues and revokes anchors. The **Evidence Viewer** displays packs and, optionally, a Boxer snapshot (identity badges, trust signals, revocation warnings). See [BOXER.md](./BOXER.md) for what Boxer was made for, what’s in it, and how users use it in Pact.

---

## What are anchors?

An **anchor attestation** is a signed statement that binds a **subject** (an agent’s Ed25519 public key) to identity claims. It answers: “Who is this key?” in human terms (e.g. “Acme Data LLC”, “Human Expert A”) and how they were verified (KYB, credential, platform, etc.).

- **Subject**: `subject_signer_public_key_b58` — the key that signed Pact messages (e.g. provider, expert).
- **Issuer**: `issuer_public_key_b58` — the registry or authority that signed the attestation.
- **Anchor type**: e.g. `kyb_verified`, `credential_verified`, `platform_verified`, `service_account_verified`.
- **Display name**: Optional human-readable label (e.g. “Acme Data LLC”) shown in the viewer.
- **Verification method**: How the identity was verified: `kyb`, `oidc`, `stripe`, `api_key`, `service_account`, `hardware`.

Anchors are **offline-verifiable**: anyone with the attestation and the issuer’s public key (in a trusted set) can verify the signature and expiry without calling the registry.

---

## Schema (v1)

The attestation schema is defined in `schemas/pact_anchor_attestation_v1.json`.

**Required fields:**

| Field | Description |
|-------|-------------|
| `anchor_id` | Stable id: `anchor-` + SHA256(canonical payload without signature) |
| `subject_signer_public_key_b58` | Agent public key this attestation binds to (Base58 Ed25519) |
| `anchor_type` | One of: `kyb_verified`, `credential_verified`, `platform_verified`, `service_account_verified`, `domain_verified`, `oidc_verified` |
| `issuer_public_key_b58` | Registry/issuer public key (Base58 Ed25519) |
| `issued_at_ms` | Unix timestamp (ms) when issued |
| `payload` | Opaque object (claims, scope, etc.) |
| `signature_b58` | Ed25519 signature over canonical payload (Base58) |
| `scheme` | `"ed25519"` |

**Optional fields:**

| Field | Description |
|-------|-------------|
| `display_name` | Human-readable name (e.g. “Acme Data LLC”) |
| `verification_method` | e.g. `kyb`, `oidc`, `stripe`, `api_key`, `service_account`, `hardware` |
| `expires_at_ms` | Expiry timestamp (ms); `null` if no expiry |
| `revocation_ref` | Stable id for revocation, e.g. `revocation:<anchor_id>` |
| `evidence_refs` | Array of external reference ids (not documents) |

---

## How issuance works

1. **Registry keys**: The registry has an Ed25519 keypair. The public key is in the **trusted issuer root set**; the secret key is used to sign attestations (env or dev fixture only).
2. **Issue request**: You send `subject_signer_public_key_b58`, `anchor_type`, `payload`, and optionally `display_name`, `verification_method`, `expires_at_ms`, `evidence_refs`.
3. **Canonical + sign**: The registry builds the attestation (without `anchor_id` and `signature_b58`), canonicalizes it, computes `anchor_id = "anchor-" + sha256(canonical)`, sets `revocation_ref = "revocation:" + anchor_id`, then signs the full payload and sets `signature_b58`.
4. **Storage**: The signed attestation is stored in the file-backed DB (JSONL under `packages/registry/data`) and returned to the caller.

---

## Pact Registry service (HTTP)

**Package:** `packages/registry`

**Tech:** Node/TypeScript, Express, file-backed DB (JSONL) under `packages/registry/data`. Deterministic test keys can be stored in fixtures for dev.

**Endpoints:**

### 1) POST /v1/anchors/issue

Creates and stores a new anchor attestation. Requires `x-api-key` header (or `api_key` query) matching `REGISTRY_API_KEY`.

**Request body:**

```json
{
  "subject_signer_public_key_b58": "<base58 pubkey>",
  "anchor_type": "kyb_verified",
  "payload": { "scope": "demo", "label": "Acme Data LLC" },
  "display_name": "Acme Data LLC",
  "verification_method": "kyb",
  "expires_at_ms": null,
  "evidence_refs": null
}
```

**Response:** `201` with `{ "anchor_attestation": { ... } }` (full signed object including `anchor_id` and `signature_b58`).

**Example (curl):**

```bash
curl -X POST http://localhost:3042/v1/anchors/issue \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-api-key" \
  -d '{
    "subject_signer_public_key_b58": "J16RoSSAux4rQsUjnynHcNjx6tAo2v6T2efvwNdZeREN",
    "anchor_type": "kyb_verified",
    "payload": {"scope": "demo", "label": "Acme Data LLC"},
    "display_name": "Acme Data LLC",
    "verification_method": "kyb"
  }'
```

#### Stripe platform_verified

For **Verified Provider** without exposing crypto to users, use `anchor_type: "platform_verified"` with `verification_method: "stripe"`. The payload must contain **only non-sensitive identifiers** (no raw Stripe account or customer IDs).

**Payload convention** for `platform_verified` + Stripe:

| Field | Required | Description |
|-------|----------|-------------|
| `platform` | Yes | Must be `"stripe"`. |
| `account_type` | Yes | `"merchant"` or `"customer"`. |
| `account_id_fingerprint` | Yes | `"sha256:<hex>"` — hash of Stripe account/customer ID, never the raw ID. |
| `scope` | No | Array of capabilities, e.g. `["payments", "refunds"]`. |
| `region` | No | e.g. `"US"`. |
| `linked_at_ms` | No | Unix timestamp (ms) when linked. |
| `display_name` | No | Optional label, e.g. `"Acme Data LLC (Stripe)"`. |

The registry **rejects** payloads that look like raw Stripe IDs (e.g. values starting with `acct_` or `cus_`); use a SHA-256 fingerprint instead.

**Example (curl):**

```bash
# Use a fingerprint (sha256 of account id), not the raw id
curl -X POST http://localhost:3100/v1/anchors/issue \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-api-key" \
  -d '{
    "subject_signer_public_key_b58": "<provider_pubkey>",
    "anchor_type": "platform_verified",
    "verification_method": "stripe",
    "payload": {
      "platform": "stripe",
      "account_type": "merchant",
      "account_id_fingerprint": "sha256:abc123...",
      "scope": ["payments", "refunds"],
      "region": "US"
    },
    "display_name": "Acme Data LLC (Stripe)"
  }'
```

Run `./scripts/issue_demo_platform_stripe.sh` to issue a Stripe Verified anchor for the API Procurement provider (see script for provider pubkey extraction from the pack).

#### service_account_verified (cloud workload identity)

For **Service Account Verified** (cloud workload identity), use `anchor_type: "service_account_verified"` with `verification_method: "service_account"`. The payload must contain **only non-sensitive identifiers** (no raw JWTs, SAML, or API keys).

**Payload convention** for `service_account_verified`:

| Field | Required | Description |
|-------|----------|-------------|
| `cloud` | Yes | `"aws"`, `"gcp"`, or `"azure"`. |
| `service_account` | Yes | e.g. `svc-my-agent@project.iam.gserviceaccount.com` or `arn:aws:iam::...:role/...`. |
| `attestation_type` | No | `"challenge_response"`, `"workload_identity"`, or `"metadata_signature"`. |
| `evidence_fingerprint` | Yes | `"sha256:<64 hex>"` — hash of proof blob, never the blob. |
| `scope` | No | Array of capabilities, e.g. `["signing", "payments", "data_access"]`. |
| `region` | No | e.g. `"US"`. |
| `account_id` | No | Optional, non-sensitive. |
| `workload_id` | No | Optional. |

The registry **rejects** payloads that contain raw JWTs (`eyJ`), SAML (`<saml`), or Bearer tokens; use `evidence_fingerprint` instead.

Run `./scripts/issue_demo_service_account.sh` to issue a service_account_verified anchor for Provider B.

#### oidc_verified (enterprise identity binding)

For **OIDC Verified** (enterprise identity binding), use `anchor_type: "oidc_verified"` with `verification_method: "oidc"`. The payload must contain **only non-sensitive identifiers** (no raw JWTs or SAML assertions).

**Payload convention** for `oidc_verified`:

| Field | Required | Description |
|-------|----------|-------------|
| `issuer` | Yes | Issuer URL, e.g. `https://issuer.example.com`. |
| `subject` | Yes | User or service subject identifier. |
| `assertion_fingerprint` | Yes | `"sha256:<64 hex>"` — hash of id_token or SAML assertion, never the raw assertion. |
| `audience` | No | e.g. `"pact-registry"`. |
| `tenant` | No | e.g. `"acme"`. |
| `email` | No | e.g. `"service@acme.com"`. |
| `scope` | No | Array of scopes, e.g. `["procurement", "settlement"]`. |

The registry **rejects** payloads that contain raw JWTs (`eyJ`) or SAML (`<saml`); use `assertion_fingerprint` instead.

Run `./scripts/issue_demo_oidc.sh` to issue an oidc_verified anchor for the Buyer.

#### Enterprise identity bundle

Run `./scripts/issue_demo_enterprise_identity_bundle.sh` to issue both service_account_verified (Provider B) and oidc_verified (Buyer) anchors and merge into `/tmp/issued_enterprise_anchors.json`. Then recompute Boxer:

```bash
pnpm boxer:recompute --pack design_partner_bundle/packs/auditor_pack_api_success.zip --anchors /tmp/issued_enterprise_anchors.json --out /tmp/passport_api_enterprise.json
```

Load the pack + snapshot in the viewer; Provider B shows "Service Account Verified", Buyer shows "OIDC Verified".

**Acceptance tests (Stripe platform_verified):**

1. **Registry:** Issue a `platform_verified` anchor with stripe payload (e.g. run the demo script or `validatePlatformVerified.test.ts`); verify it is stored and returned with `anchor_type`, `verification_method`, and `payload` intact.
2. **Viewer:** Load the API Procurement pack and a snapshot that includes the Stripe Verified anchor (e.g. from Boxer recompute using `/tmp/issued_stripe_anchor.json`); confirm the "Stripe Verified" badge appears in Parties, Transcript Rounds, and Trust Signals, and the Party modal shows the Platform (Stripe) section with platform, account type, scope, issuer, issued at.
3. **Boxer:** Recompute with anchors that include a `platform_verified` (stripe) anchor; confirm `entity.anchors` includes it with `type`, `verification_method`, and optional `payload`/`issued_at_ms`.
4. **Optional (revocation):** Revoke the anchor via `POST /v1/anchors/revoke`; if the snapshot or by-subject response includes `revoked: true`, the viewer shows the warning banner (Party modal and Trust Signals). Warn only; evidence remains valid.

### 2) POST /v1/anchors/revoke

Records a revocation. Requires API key.

**Request body:**

```json
{
  "anchor_id": "anchor-71c9aadee46c12815d4108a1a15a66cfe927818028b80ebd294061b01603ef33",
  "reason": "KYB expired",
  "revoked_at_ms": 1770314600000
}
```

**Response:** `{ "ok": true, "revocation": { "anchor_id", "revoked_at_ms", "reason" } }`.

**Example (curl):**

```bash
curl -X POST http://localhost:3042/v1/anchors/revoke \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-api-key" \
  -d '{"anchor_id": "anchor-71c9aadee46c...", "reason": "KYB expired"}'
```

### 3) GET /v1/anchors/by-subject/:subject_pubkey

Returns latest non-expired anchors for the subject, with a `revoked` flag when the anchor is in the revocation list.

**Response:** `{ "anchors": [ ... ] }`.

### 4) GET /v1/revocations/:anchor_id

Returns revocation status for one anchor.

**Response:** `{ "revoked": true|false, "revoked_at_ms": number|null, "reason": string|null }`.

---

## Offline verification

Verification **does not require the registry** to be online.

1. **Schema**: Required fields must be present and valid.
2. **anchor_id**: Recompute from the attestation (canonical form without `signature_b58` and without `anchor_id`). Must match `att.anchor_id`.
3. **Signature**: Ed25519 signature over the canonical payload (including `anchor_id` and `revocation_ref`) must verify with `issuer_public_key_b58`.
4. **Expiry**: If `expires_at_ms` is set, it must be in the future.
5. **Trusted issuer**: `issuer_public_key_b58` must be in the **trusted issuer root set**.

The verifier is in `packages/registry/src/verify.ts`: `verifyAttestationOffline(attestation, trustedIssuers)`.

---

## Trusted issuer root set

Verifiers require anchors to be signed by a known issuer. The root set is a config file:

**Path:** `configs/trusted_issuers.json`

**Shape:**

```json
{
  "issuers": [
    {
      "issuer_public_key_b58": "<base58 public key of registry>",
      "name": "Pact Registry (dev)",
      "scopes": ["kyb_verified", "credential_verified", "platform_verified", "service_account_verified", "domain_verified", "oidc_verified"]
    }
  ]
}
```

Replace `issuer_public_key_b58` with your registry’s public key (e.g. from `REGISTRY_ISSUER_PUBLIC_KEY_B58` or run `pnpm -C packages/registry gen:keys`).

---

## Optional online revocation check

Verification is **offline-first**. If a registry URL is configured, the verifier may optionally call:

- **GET** `{registryUrl}/v1/revocations/:anchor_id`

If the response says `revoked: true`, the verifier should **warn** only (e.g. “Anchor has been revoked”) and still allow offline-valid attestations to be used. No hard failure for revocation unless you explicitly require online checks.

The registry package exports `fetchRevocationStatus(registryUrl, anchorId)` for this purpose.

---

## Admin CLI

**Binary:** `pact-registry` (from `packages/registry`).

**Environment:** Set `REGISTRY_ISSUER_SECRET_KEY_B58` and `REGISTRY_ISSUER_PUBLIC_KEY_B58` (e.g. via `.env` or `.env.registry`). For CLI writes, `REGISTRY_DATA_DIR` defaults to `packages/registry/data`.

### Commands

**Issue an anchor:**

```bash
pnpm -C packages/registry exec node dist/cli.js issue \
  --subject "J16RoSSAux4rQsUjnynHcNjx6tAo2v6T2efvwNdZeREN" \
  --type kyb_verified \
  --display-name "Acme Data LLC" \
  --method kyb \
  --payload payload.json
```

If `--payload` is omitted, an empty object `{}` is used.

**Revoke an anchor:**

```bash
pnpm -C packages/registry exec node dist/cli.js revoke \
  --anchor-id "anchor-71c9aadee46c12815d4108a1a15a66cfe927818028b80ebd294061b01603ef33" \
  --reason "KYB expired"
```

**List anchors by subject:**

```bash
pnpm -C packages/registry exec node dist/cli.js list \
  --subject "J16RoSSAux4rQsUjnynHcNjx6tAo2v6T2efvwNdZeREN"
```

---

## Demo: issue anchors for pilots

**1. Generate registry keys (once):**

```bash
pnpm -C packages/registry gen:keys
```

Copy the printed `REGISTRY_ISSUER_PUBLIC_KEY_B58` and `REGISTRY_ISSUER_SECRET_KEY_B58` into `.env.registry` in the repo root (or export them). Add `.env.registry` to `.gitignore` (already done).

**2. Issue demo anchors:**

```bash
pnpm -C packages/registry build
node scripts/issue_demo_anchors.mjs
```

This issues anchors for the Art and API pilots and writes `fixtures/anchors/issued_<date>.json` (Boxer-compatible).

**Stripe Verified (API Procurement provider):** Run `./scripts/issue_demo_platform_stripe.sh` to issue a Stripe Verified anchor for the API Procurement provider. The script extracts the provider pubkey from `design_partner_bundle/packs/auditor_pack_api_success.zip` (ASK signer), then writes `/tmp/issued_stripe_anchor.json` in Boxer anchors format. Ensure the registry is running (e.g. `PORT=3100 pnpm -C packages/registry start`) and `.env.registry` or `REGISTRY_*` is set.

**3. Recompute packs with Boxer:**

```bash
pnpm --filter @pact/boxer recompute --anchors fixtures/anchors/issued_2026-02-05.json ...
```

**Recompute API pack with Stripe anchor:** Create the anchors file first, then run Boxer:

1. **Create the Stripe anchor file** (requires registry running on port 3100):  
   `./scripts/issue_demo_platform_stripe.sh`  
   This writes `/tmp/issued_stripe_anchor.json`. If you skip this step, Boxer will report "Anchors file not found".

2. **Recompute** (from repo root):

```bash
# Option A: point at the pack zip
pnpm boxer:recompute --pack "$(pwd)/design_partner_bundle/packs/auditor_pack_api_success.zip" --anchors /tmp/issued_stripe_anchor.json --out /tmp/passport_api_with_stripe.json

# Option B: use a directory (create it and copy the zip first)
mkdir -p /tmp/packs_api_only && cp design_partner_bundle/packs/auditor_pack_api_success.zip /tmp/packs_api_only/
pnpm boxer:recompute --in /tmp/packs_api_only --anchors /tmp/issued_stripe_anchor.json --out /tmp/passport_api_with_stripe.json
```

**4. Viewer:** Load the snapshot; in the Party modal and Trust Signals you should see “Verified: **Acme Data LLC**” (or the relevant `display_name`) and badge tooltips with issuer, `verification_method`, and expiry.

---

## Production: Anchor Onboarding + Stripe Connect / OIDC

The **Anchor Onboarding** app (`apps/anchor-onboarding`) supports **production integrations** when env vars are set:

### Stripe Connect (platform_verified)

Set `STRIPE_CLIENT_ID`, `STRIPE_CLIENT_SECRET`, `STRIPE_CONNECT_REDIRECT_URI` (e.g. from Stripe Dashboard → Connect → OAuth). The UI shows a **Connect with Stripe** button. User authorizes the connection; the callback exchanges the code for the connected account ID, hashes it to `account_id_fingerprint` (sha256), and issues a platform_verified anchor via the registry. Raw Stripe account IDs are never logged or stored.

### OIDC (oidc_verified)

Set `OIDC_ISSUER` and `OIDC_JWKS_URI` (e.g. `https://issuer.example.com/.well-known/jwks.json`). The UI shows an **OIDC Verify** section. User pastes an `id_token` (JWT) from their IdP. The server validates the JWT via JWKS, computes `assertion_fingerprint` (sha256 of the token), and returns the payload for an oidc_verified anchor. User completes issuance via the Issue form.

See `apps/anchor-onboarding/README.md` and `.env.example` for full setup.

### Evidence Viewer ↔ Onboarding link

Set `VITE_ANCHOR_ONBOARDING_URL` in the Evidence Viewer (e.g. in `.env`) to the onboarding app URL. The Party modal links to onboarding with `?pubkey=<party_pubkey>` prefilled. Use `.env.example` as a template.

---

## Acceptance tests

- **Unit tests** (`packages/registry/src/__tests__/issue_verify.test.ts`): Issue anchor → verify signature → stable `anchor_id`; revoke → verifier warns revoked; expiry respected.
- **E2E:** Start registry locally, issue KYB for “Acme Data LLC” bound to provider key, run Boxer recompute with issued anchors, load snapshot in viewer and confirm “Verified Provider: Acme Data LLC” and KYB badge.
- **Enterprise identity (service_account_verified + oidc_verified):** (1) Start registry with `.env.registry`. (2) Run `./scripts/issue_demo_enterprise_identity_bundle.sh`. (3) Recompute Boxer: `pnpm boxer:recompute --pack design_partner_bundle/packs/auditor_pack_api_success.zip --anchors /tmp/issued_enterprise_anchors.json --out /tmp/passport_api_enterprise.json`. (4) Load pack + snapshot in Evidence Viewer. (5) Provider B shows "Service Account Verified"; Buyer shows "OIDC Verified". (6) Party modal shows structured anchor details. (7) Optional: revoke one anchor; confirm viewer warning (warn-only).

---

## Summary

| Deliverable | Location |
|------------|----------|
| Anchor schema v1 | `schemas/pact_anchor_attestation_v1.json` |
| Registry service | `packages/registry` (Express, JSONL store) |
| Issue/Revoke/List API | `POST /v1/anchors/issue`, `POST /v1/anchors/revoke`, `GET /v1/anchors/by-subject/:key`, `GET /v1/revocations/:anchor_id` |
| Offline verification | `packages/registry/src/verify.ts` + `configs/trusted_issuers.json` |
| Optional revocation check | `fetchRevocationStatus(registryUrl, anchorId)` |
| Admin CLI | `packages/registry` — `issue`, `revoke`, `list` |
| Demo script | `scripts/issue_demo_anchors.mjs`; keygen: `pnpm -C packages/registry gen:keys` |
| Viewer/Boxer | Viewer shows `display_name` and badge tooltips; Boxer accepts registry-issued anchors |
