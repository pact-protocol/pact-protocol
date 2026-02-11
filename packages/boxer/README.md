# Boxer — Pact Passport Snapshot (Trust Signals)

**Boxer** is the Pact component that produces **passport snapshots**: derived, forward-looking trust signals from auditor packs plus identity anchors. It was built for the **Pact Identity Layer** and design-partner demos (Art Acquisition, Autonomous API Procurement) to show who stands behind signing keys without changing evidence or verification.

## What project Boxer was made for

- **Pact Identity Layer:** Bind signing keys to real-world identity (KYB, credentials, platform verification, OIDC, service account). Evidence stays in the pack; identity is layered on as **derived** context.
- **Design partner demos:** Offline, repeatable demos where the Evidence Viewer shows identity badges, expert credentials, and revocation warnings. No registry required when using precomputed snapshots.
- **Trust, not verification:** Boxer does **not** verify packs. Pack verification is done by `pact-verifier auditor-pack-verify`. Boxer consumes already-verified (or at least loaded) pack content plus an anchors file to produce a snapshot.

## What is in Boxer

- **CLI `recompute`:** Reads one auditor pack (ZIP) and one anchors file (JSON), writes a single passport snapshot (JSON).
- **Snapshot contents:**
  - **entities** — One per signer in the transcript (and optionally anchor-only parties). Each entity has:
    - `signer_public_key_b58`, `entity_id`, `software_attestation`
    - **domains** — Domain-scoped metrics (e.g. reliability_score) from transcript claims
    - **anchors** — Identity badges (type, issuer, revoked, revoked_at_ms, reason) from the anchors file
  - **recommendations** — Forward-looking messages (e.g. trust gates, rerun/escalation, **revocation warnings** when anchors are revoked)
- **Revocation awareness:** If an anchor has `revoked: true`, Boxer adds recommendations (`avoid_revoked_identity`, `revocation_warning`) and applies a reliability penalty; the snapshot is still produced so the viewer can show “trust degraded, evidence valid.”
- **Deterministic:** Same pack + same anchors → same snapshot (optionally `--deterministic` for sorted keys).

Schema: [pact-passport-snapshot v0](../../schemas/pact_passport_snapshot_v0.md).

## How Boxer improves Pact

- **Identity without touching evidence:** Pact’s core guarantee is offline verification of transcripts and packs. Boxer adds a separate, derived layer: “who is this key?” (anchors) and “what should I do next?” (recommendations) without modifying or re-verifying the pack.
- **One place for trust logic:** Domain scoring, anchor badges, and revocation warnings live in Boxer. The Evidence Viewer and other consumers only display snapshot data; they don’t recompute it.
- **Offline-first:** Snapshots can be produced entirely offline (pack + anchors file). Registry is optional and only needed for **issuing** anchors, not for running Boxer.

## How Pact uses Boxer

- **Evidence Viewer:** Loads a pack (evidence) and optionally a **passport snapshot** (derived). The viewer uses the snapshot to show:
  - Party identity badges (KYB, OIDC, Stripe, credential, etc.)
  - Reliability and trust gates
  - Revocation warnings (banner, ⚠ on parties with revoked anchors, Party modal “Revoked” + reason)
  - Recommendations (“Future use not recommended” when revoked)
- **Design partner bundle:** `design_partner_bundle/scripts/recompute_snapshots.sh` runs Boxer to regenerate `fixtures/snapshots/passport_art_enterprise.json`, `passport_api_enterprise.json`, `passport_api_revoked.json`. `verify_all.sh` runs Boxer as a smoke check (art pack + anchors → entities with badges; API pack + anchors → Provider B KYB; revoked snapshot → revoked anchor + recommendation).

## How users can use Boxer in Pact

1. **Offline demo (no registry)**  
   - Use precomputed snapshots from `design_partner_bundle/fixtures/snapshots/`, or  
   - Run: `./design_partner_bundle/scripts/recompute_snapshots.sh` (uses repo and bundle anchor fixtures).  
   - In the viewer: load a pack, then “Load Passport Snapshot” and select the snapshot file.

2. **Custom anchors file**  
   - Create a JSON file with an `anchors` array (entries with `signer_public_key_b58` or `subject_signer_public_key_b58`, `anchor_type`, optional `label`, `revoked`, `revoked_at_ms`, `reason`).  
   - Run Boxer:  
     `pnpm boxer:recompute --pack <path-to-pack.zip> --anchors <path-to-anchors.json> --out <path-to-snapshot.json>`  
   - Load the pack and the generated snapshot in the Evidence Viewer.

3. **Live issuance (optional)**  
   - Start the registry, issue anchors via the registry CLI/API, export anchors in Boxer-compatible format (see `scripts/issue_demo_platform_stripe.sh` etc.).  
   - Run Boxer with that anchors file; load pack + snapshot in the viewer.

4. **Production anchors (Stripe Connect, OIDC)**  
   - Use the **Anchor Onboarding** app (`apps/anchor-onboarding`) with real Stripe Connect or OIDC verification to issue `platform_verified` and `oidc_verified` anchors.  
   - Download anchors from the onboarding UI, run Boxer with that file, load pack + snapshot in the Evidence Viewer.  
   - See [docs/guides/RUN_PRODUCTION_FLOWS_LOCAL.md](../../docs/guides/RUN_PRODUCTION_FLOWS_LOCAL.md) and [docs/IDENTITY_LAYER_MVP.md](../../docs/IDENTITY_LAYER_MVP.md).

5. **Regenerate design-partner snapshots**  
   - From repo root: `./design_partner_bundle/scripts/recompute_snapshots.sh`  
   - Writes into `design_partner_bundle/fixtures/snapshots/`. Deterministic; safe to re-run.

## Commands

From repo root:

```bash
# Build
pnpm --filter @pact/boxer run build

# Recompute (default out: /tmp/passport_art_v0_4.json)
pnpm boxer:recompute --pack design_partner_bundle/packs/auditor_pack_art_success.zip --anchors fixtures/anchors/art_anchors.json --out /tmp/passport_art.json

# With deterministic key order
pnpm boxer:recompute --pack <pack.zip> --anchors <anchors.json> --out <out.json> --deterministic
```

## Summary

| Aspect | Boxer |
|--------|--------|
| **Made for** | Pact Identity Layer; design-partner demos (Art + API pilots); trust signals without changing evidence |
| **Contains** | CLI `recompute`; passport snapshot (entities, domains, anchors, recommendations); revocation-aware scoring |
| **Improves Pact** | Adds derived identity and recommendations; single place for trust logic; offline-first |
| **Used by Pact** | Evidence Viewer (badges, trust, revocation UI); design partner bundle (sync + smoke checks) |
| **Users** | Load precomputed snapshots, or run recompute with custom anchors; optional live issuance via registry |
