# Boxer — Pact Passport Snapshot (Trust Signals)

**Boxer** is the Pact component that produces **passport snapshots**: derived, forward-looking trust signals from auditor packs plus identity anchors. It does **not** verify evidence; it adds an identity and trust layer on top of verified (or loaded) packs.

## Distinction at a glance

| | Verifier (CLI) | Boxer |
|--|----------------|--------|
| **Purpose** | Verify transcripts and auditor packs (offline); produce GC view, judgment, insurer summary | Produce passport snapshots: entities, anchor badges, domain metrics, recommendations |
| **Input** | Auditor pack ZIP (and constitution, etc.) | Auditor pack ZIP + **anchors file** (JSON) |
| **Output** | Verification result; derived artifacts inside pack (gc_view, judgment, etc.) | **Passport snapshot** JSON (entities, recommendations) — consumed by Evidence Viewer |
| **Evidence** | Verification is authoritative for pack integrity and responsibility | Snapshot is **derived, not evidence**; does not change or verify the pack |
| **Registry** | Not required | Not required for recompute; registry only for **issuing** anchors |

## What project Boxer was made for

- **Pact Identity Layer:** Bind signing keys to real-world identity (KYB, credentials, platform verification, OIDC, service account) without storing that identity in the pack. Evidence stays sealed; identity is a separate, derived layer.
- **Design partner demos:** Art Acquisition (subjectivity, credentialed experts) and Autonomous API Procurement (enterprise identity, usable today). Demos are offline when using precomputed snapshots.
- **Trust signals:** “Who is this key?” and “What should I do next?” (recommendations, revocation warnings) in one place, so the Evidence Viewer and other consumers only display data, not recompute it.

## What is in Boxer

- **CLI `recompute`:** One auditor pack + one anchors file → one passport snapshot (see [pact-passport-snapshot v0](../schemas/pact_passport_snapshot_v0.md)).
- **Snapshot:** `entities` (per signer: domains, anchor badges, optional revocation), `recommendations` (trust gates, escalation, **revocation warnings** when anchors are revoked).
- **Revocation:** If an anchor has `revoked: true`, Boxer adds recommendations and applies a reliability penalty; the snapshot still includes the anchor so the viewer can show “trust degraded, evidence valid.”

## How Boxer improves Pact

- Keeps **evidence** (pack + verifier) and **trust/identity** (Boxer snapshot) separate; verification remains offline and authoritative.
- Single place for domain scoring, anchor badges, and revocation logic; viewers and tooling consume snapshots instead of reimplementing.
- **Offline-first:** Snapshots can be generated from pack + anchors file only; registry is optional (for issuance).

## How Pact uses Boxer

- **Evidence Viewer:** Load pack + optional passport snapshot. Viewer shows identity badges, reliability, revocation warnings, and recommendations from the snapshot.
- **Design partner bundle:** `recompute_snapshots.sh` regenerates precomputed snapshots; `verify_all.sh` runs Boxer as a smoke check (art/API/revoked snapshots).

## How users can use Boxer in Pact

1. **Offline:** Use precomputed snapshots in `design_partner_bundle/fixtures/snapshots/`, or run `./design_partner_bundle/scripts/recompute_snapshots.sh`. In the viewer: load pack → Load Passport Snapshot → select JSON.
2. **Custom anchors:** Create an anchors JSON file; run `pnpm boxer:recompute --pack <pack.zip> --anchors <anchors.json> --out <out.json>`; load pack + snapshot in the viewer.
3. **Live issuance (optional):** Use the registry to issue anchors, export Boxer-compatible anchors, run Boxer, then load pack + snapshot.
4. **Production anchors:** Use the **Anchor Onboarding** app (`apps/anchor-onboarding`) with Stripe Connect or OIDC to issue real `platform_verified` and `oidc_verified` anchors. Export anchors, run Boxer recompute, load pack + snapshot in the Evidence Viewer. See [guides/RUN_PRODUCTION_FLOWS_LOCAL.md](./guides/RUN_PRODUCTION_FLOWS_LOCAL.md) and [IDENTITY_LAYER_MVP.md](./IDENTITY_LAYER_MVP.md).

Full details, commands, and examples: **[packages/boxer/README.md](../packages/boxer/README.md)**.
