# Design Partner Demo Walkthrough

**Offline-first:** No registry required. Use precomputed packs and passport snapshots.

**Time:** ~5 minutes for both pilots + revocation.

---

## Before you start

From repo root:

```bash
pnpm install
./design_partner_bundle/verify_all.sh
pnpm --filter @pact/evidence-viewer dev
```

Open the URL Vite prints (e.g. http://localhost:5173). The **Load Demo Pack** dropdown loads from `apps/evidence-viewer/public/packs/` (synced from `design_partner_bundle/packs/` by `verify_all.sh`).

---

## 1. Autonomous API Procurement (usable today + enterprise identity)

**~2 min**

| Step | Action | What to point out |
|------|--------|-------------------|
| 1 | **Load Demo Pack** → **Autonomous API Procurement (Success)** | Pack loads; Summary shows outcome COMPLETED, integrity VALID. |
| 2 | **Load Passport Snapshot** → choose `design_partner_bundle/fixtures/snapshots/passport_api_enterprise.json` | Snapshot is **derived** (not evidence); it adds identity context. |
| 3 | **Parties** (Summary tab) | Buyer and Provider show identity badges (OIDC, KYB, domain). |
| 4 | Click **Provider** (party chip) → Party modal | **Identity** section: Software attestation, Anchors (Active). **Platform / OIDC / KYB** sections show structured badges. |
| 5 | **Transcript** tab → Rounds | Who signed which round; same identity badges on chips. |

**Narrative:** "This pack is verified offline. The snapshot adds enterprise identity bindings—OIDC for the buyer, KYB and domain for the provider—so we can see who stood behind the keys. Evidence stays in the pack; the snapshot is derived for trust signals only."

---

## 2. Revocation (trust degraded, evidence still valid)

**~1 min**

| Step | Action | What to point out |
|------|--------|-------------------|
| 1 | Keep **Autonomous API Procurement** pack loaded. | — |
| 2 | **Load Passport Snapshot** → `design_partner_bundle/fixtures/snapshots/passport_api_revoked.json` | Replaces the previous snapshot; one anchor is now revoked. |
| 3 | Global banner (top of viewer) | **"Warning: One or more identity attestations have been revoked. Evidence remains verified; trust signals may be downgraded."** |
| 4 | **Parties** | Provider chip shows **⚠️** (tooltip: "Identity verification revoked after issuance"). |
| 5 | Open **Provider** Party modal | **Trust** / Identity: one anchor shows **Revoked**, reason and revoked_at. Callout: "This verification is no longer valid for future transactions." |

**Narrative:** "Revocation doesn’t change the evidence or verification. It degrades trust for future use. The viewer warns everywhere: banner, party badge, and modal. Offline demo uses a precomputed snapshot with one revoked anchor; no registry needed."

---

## 3. Art Acquisition (subjectivity + credentialed experts)

**~2 min**

| Step | Action | What to point out |
|------|--------|-------------------|
| 1 | **Load Demo Pack** → **Art Acquisition (Success)** | Different pilot: art acquisition with expert opinions. |
| 2 | **Load Passport Snapshot** → `design_partner_bundle/fixtures/snapshots/passport_art_enterprise.json` | Snapshot adds expert credentials (credential_verified, KYB, domain). |
| 3 | **Parties** | Gallery, experts, provenance agent with badges. |
| 4 | **Outcome** tab → Expert opinions (if present) | Expert claims and confidence; credentialed experts. |
| 5 | Open an **Expert** party chip → Party modal | **Credential** section: scope/specialty, issuer; status Active. |

**Narrative:** "Art pilot shows subjectivity and expert identity. Experts carry credential_verified anchors; the snapshot is again derived. Two canonical pilots: API Procurement for usable-today + enterprise identity, Art Acquisition for subjectivity + credentialed experts."

---

## Summary

| Pilot | Pack | Snapshot | Key message |
|-------|------|----------|-------------|
| API Procurement | Autonomous API Procurement (Success) | passport_api_enterprise.json | Enterprise identity (OIDC, KYB, domain); usable today. |
| Revocation | (same pack) | passport_api_revoked.json | Trust degraded; evidence still valid; no registry. |
| Art Acquisition | Art Acquisition (Success) | passport_art_enterprise.json | Credentialed experts; subjectivity. |

**Derived vs evidence:** Packs are sealed evidence (verified by CLI). Snapshots and claims packages are **derived**; they support trust and narrative, not verification of the pack itself.
