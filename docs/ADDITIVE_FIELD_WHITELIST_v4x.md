# Additive Field Whitelist (v4.x)

**Status:** Contract (Binding for Pact v4.x)  
**Version:** ADDITIVE_FIELD_WHITELIST_v4x  
**Subtitle:** Allowed additive-only changes in v4.x

---

## 1. Purpose

Under [INTERFACE_FREEZE_v1.md](./INTERFACE_FREEZE_v1.md), existing CLI outputs and artifact schemas are frozen. **Existing fields SHALL NOT change meaning.** New fields MAY be added only in a backward-compatible, additive way.

This document defines the **additive field whitelist**: the exact paths, artifact extensions, and categories of change permitted within v4.x without breaking the freeze. Additive changes SHALL NOT introduce new guarantees, SHALL NOT weaken existing guarantees, and SHALL NOT cause semantic drift. Consumers MUST treat additive fields as optional and MUST NOT rely on their presence or absence for verification, coverage, or admissibility.

---

## 2. Invariants (No Exceptions)

- **No new guarantees.** Additive fields do not create new contractual obligations. They are informational or optional extensions only.
- **No weakening.** Additive fields do not relax, narrow, or override any frozen guarantee (CLI behavior, exit codes, fault domains, constitution enforcement, PoN, recompute).
- **No semantic drift.** The meaning of existing fields, commands, and artifacts SHALL NOT change. Additive content does not alter how verification, coverage, or admissibility are determined.

---

## 3. Exact Allowed Places

The following are the **only** categories where additive-only changes are permitted in v4.x:

| Category | Allowed | Not allowed |
|----------|---------|-------------|
| **Documentation** | New or updated docs (guides, specs, indexes). Clarifications that do not change contract meaning. | Docs that contradict INTERFACE_FREEZE_v1 or this whitelist. |
| **New CLI commands** | New optional subcommands that do not change behavior of existing subcommands. New optional flags on existing commands. | Removing or changing meaning of existing commands/flags; changing stdout JSON shape of existing commands. |
| **New optional derived files** | New optional files under `derived/` that are not required for verification. Packs remain valid with or without them. | New required derived files; changing content or meaning of existing derived files. |
| **UI-only changes** | Evidence Viewer layout, panels, styling, new panels for additive fields, PDF layout, human-readable summaries. | UI that changes interpretation of verification outcome or coverage. |
| **Additive JSON paths** | Fields listed in §4 below, in the artifacts and locations specified. | New required fields; changes to existing field semantics. |

---

## 4. Allowed Additive Paths (Exact List)

The following paths are whitelisted for additive inclusion. Their presence MUST NOT change the semantic meaning of existing verification, recompute, or coverage outcomes. **Exact artifact and JSONPath only;** manifest is frozen in INTERFACE_FREEZE_v1 and is not whitelisted here.

| Artifact (schema) | JSONPath | Description |
|-------------------|----------|-------------|
| gc_view/1.0 | `audit` | Audit block (tier, sla, note). Informational only. |
| insurer_summary/1.0 | `audit_tier`, `audit_sla` | Audit metadata. Informational only. |
| policy (v4 policy schema) | `audit` | Audit metadata (tier, SLA, note) on policy. Informational only. |

**Out of scope for v4.0.5-rc3:** Batch anchoring (e.g., Merkle digests) is out-of-scope and is not shipped.

---

## 5. Rules for Implementations

- **Additive only.** New fields MUST NOT change the interpretation of existing fields. Verification (PoN, recompute, constitution, fault domains) is unchanged by additive fields.
- **Optional.** Consumers MUST treat whitelisted additive fields as optional. Absence of an additive field MUST NOT be treated as an error. Presence MUST NOT be required for verification or admissibility.
- **Freeze baseline.** When computing baseline hashes for freeze protection (e.g. regression tests), additive paths listed above are stripped before comparison so that adding them does not invalidate baselines. This stripping is used only for freeze regression tests; it does not affect verification.

---

## 6. What Is Not Additive

- Changing the meaning of existing CLI flags or JSON fields.
- Removing or renaming existing fields.
- Changing exit codes or success/failure semantics for existing commands.
- Adding required fields to frozen artifacts (all additive fields are optional).
- Any change that weakens, narrows, or contradicts INTERFACE_FREEZE_v1.

---

**Last Updated:** January 2026
