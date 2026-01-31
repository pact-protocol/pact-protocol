# PACT Protocol

**Pact is an evidence and verification standard for agent transactions.** It defines how negotiation and settlement outcomes are recorded, attested, and judged so that disputes can be resolved from evidence alone.

This repo is the **evidence standard + offline verifier** distribution: schemas, verifier CLI, passport recompute, auditor packs, and constitution enforcement. Use it to build, test, and verify evidence artifacts without any runtime agent or payment stack.

---

## In scope

- **Verifier** — Offline CLI for transcript verification, blame resolution (DBL), GC view, insurer summary, auditor pack verification
- **Passport recompute** — Deterministic reputation/credit state from transcripts
- **Auditor packs** — Sealed evidence bundles (success, failure, tier demos)
- **Constitution enforcement** — Rules of evidence and responsibility attribution (DBL, constitution hashes)

## Out of scope

- **SDK / runtime agent execution** — Agent-side negotiation, policy enforcement, and settlement flows live in **pact-examples**
- **Payment rails, escrow, marketplace** — No payment or escrow implementation here; see pact-examples for integration patterns

---

## Quickstart

From the repo root:

```bash
pnpm install --frozen-lockfile
pnpm release:gate
bash demo/h5-golden/run_all.sh
bash design_partner_bundle/verify_all.sh
```

**Gate behavior:** Build, test, secret scan, pack check. Skips **examples** when `examples/` is missing and **transcript verification** when `.pact/transcripts` has no `.json`. Transcript verification uses the verifier only (no SDK).

---

## Docs to keep (pact-protocol)

- **Interface / schema:** `docs/INTERFACE_FREEZE_v1.md`, `docs/ADDITIVE_FIELD_WHITELIST_v4x.md`
- **Tier spec:** `docs/TIERED_VERIFICATION_SPEC.md`
- **GC + insurer:** `docs/gc/` (e.g. Evidence Viewer spec, 5‑minute approval checklist, Insurer Underwriting View)
- **Constitution:** `docs/architecture/PACT_CONSTITUTION_V1.md`, constitution-related content in design partner bundle

## Docs to remove or clearly mark

Any doc that implies the **SDK or provider-adapter** lives in this repo should be removed from the protocol distribution or clearly marked: *“Runtime integration lives in pact-examples.”* That includes provider/how-to-run guides and integration guides aimed at agent developers.

---

This repo intentionally does not include the runtime SDK or providers; see **pact-examples** for integration.
