# Pact Protocol — Docs Index

Minimal index for the **pact-protocol** (evidence + offline verifier) repo. These docs are in scope for protocol-only distribution.

## Keep in pact-protocol

| Doc | Description |
|-----|-------------|
| [INTERFACE_FREEZE_v1.md](./INTERFACE_FREEZE_v1.md) | Interface freeze and stability guarantees |
| [ADDITIVE_FIELD_WHITELIST_v4x.md](./ADDITIVE_FIELD_WHITELIST_v4x.md) | Additive field whitelist for v4.x |
| [TIERED_VERIFICATION_SPEC.md](./TIERED_VERIFICATION_SPEC.md) | Tier spec (T1/T2/T3, coverage) |
| [gc/](./gc/) | GC + insurer docs (Evidence Viewer spec, 5‑minute checklist, Insurer Underwriting View) |
| [architecture/PACT_CONSTITUTION_V1.md](./architecture/PACT_CONSTITUTION_V1.md) | Constitution and rules of evidence |
| [passport/](./passport/) | Passport registry contract / spec (recompute, deterministic state) |

## Remove or clearly mark (not in pact-protocol)

Docs that imply **SDK or provider-adapter** live in this repo should be **removed** from the protocol distribution or **clearly marked**: *“Runtime integration lives in pact-examples.”*

Examples: provider guides, “how to run examples,” integration guides for agent developers, payment/escrow integration.
