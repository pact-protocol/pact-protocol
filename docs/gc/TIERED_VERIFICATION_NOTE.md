# Tiered Verification Note

This note clarifies how **prevention**, **evidence**, and **tiering** interact in Pact v4. Tier and SLA metadata are for audit scheduling only; they do not change verification correctness or admissibility.

---

## Prevention is always real-time (Boundary)

- **Pact Boundary** enforcement (policy, velocity, credit) runs at transaction time.
- Policy violations, velocity limits, and credit checks are evaluated before settlement.
- Aborts (e.g. PACT-101) are deterministic and recorded in the transcript; **money does not move** on abort.
- Tier metadata does **not** relax or replace Boundary checks.

---

## Evidence and batch anchoring (out of scope)

- **Evidence plane** artifacts (e.g. auditor packs, GC view, insurer summary) support both per-transcript and batched workflows.
- **Out of scope for v4.0.5-rc3:** Batch anchoring (e.g., Merkle digests) is out-of-scope and is not shipped.

---

## Tiering does NOT reduce admissibility

- **Audit tier** (T1 / T2 / T3) and **audit SLA** (e.g. “daily digest”, “replay within 15m”) are **informational only**.
- They affect **audit cadence and scheduling** (how often or how quickly evidence is reviewed), not whether a transaction is admissible or verifiable.
- A T3 transaction with SLA “daily digest” is verified with the **same** rules as a T1 transaction; tier and SLA do not change hash chain, signature, or recompute semantics.
- If tier metadata is absent, verification and admissibility are unchanged; no tier is inferred.

---

## Summary

| Concept            | Role                                      |
|--------------------|-------------------------------------------|
| **Prevention**     | Real-time (Boundary); policy, velocity, credit |
| **Evidence**       | Per-transcript; batch anchoring is out-of-scope for v4.0.5-rc3 and is not shipped |
| **Tier / SLA**     | Audit schedule only; no impact on admissibility |

For implementation details, see the Evidence Viewer spec (tier/SLA display), [TIERED_VERIFICATION_SPEC.md](../TIERED_VERIFICATION_SPEC.md), and verifier CLI (auditor-pack with tier metadata).
