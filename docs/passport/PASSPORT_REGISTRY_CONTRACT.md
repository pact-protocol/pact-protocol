# Passport Registry Contract

**Status:** Contract (Binding for Implementations)  
**Applies to:** Passport v1 registry and verifier outputs

---

## Contract Terms

Implementations of the Pact Passport Registry MUST adhere to the following.

### 1. Fields are immutable

Once a passport record field (score, tier, history entry, constitution_hash, etc.) is written from a verified transcript, it SHALL NOT be overwritten or edited. Corrections require a new transcript and a full recompute; there is no in-place mutation.

### 2. Score deltas are deterministic

Score deltas applied per transcript SHALL be computed by a deterministic, specified algorithm. Given the same transcript, DBL judgment, and signer role, the delta SHALL be identical. Implementations SHALL be replayable and recomputable at any time.

### 3. Constitution hash governs interpretation

The constitution hash under which a transcript was verified SHALL govern how that transcript is interpreted for passport updates. Non-standard constitution hashes SHALL be marked (e.g. `NON_STANDARD`) and SHALL NOT be treated as equivalent to the accepted constitution. Registry entries MAY carry a constitution_hash; recompute SHALL validate against accepted hashes where applicable.

### 4. Registry is append-only via transcripts

The registry SHALL grow only by ingesting verified Pact transcripts (or auditor-pack-verified evidence). There SHALL be no manual overrides, user-submitted score changes, or network submissions that bypass verification. New state SHALL be derived exclusively from verified artifacts.

### 5. Fault domain: INDETERMINATE_TAMPER

When integrity validation fails (hash chain or signature verification), the DBL SHALL set `fault_domain` to **INDETERMINATE_TAMPER**. This category:

- **Does not penalize the agent**: Passport score delta SHALL be zero (no negative impact).
- **Increases scrutiny**: Underwriting SHALL treat it differently from buyer or provider fault (e.g. surcharge `TAMPER_SCRUTINY`, risk factor `INDETERMINATE_TAMPER`).
- **Does not assign fault**: Fault cannot be assigned to the agent; the failure is attributed to tamper or corruption of evidence.

---

## Summary

| Principle | Requirement |
|-----------|-------------|
| **Immutability** | No overwrite or edit of written fields; corrections via recompute only. |
| **Determinism** | Same inputs → same score deltas; replayable and recomputable. |
| **Constitution** | Constitution hash governs interpretation; non-standard marked and distinguished. |
| **Append-only** | Updates only from verified transcripts/evidence; no unverified writes. |
| **INDETERMINATE_TAMPER** | Integrity failure → no agent penalty; underwriter scrutiny required. |

---

## Explicit Non-Goals — What Pact Passport Is NOT

- **Not identity** — Passport does not assert or bind real-world identity.
- **Not KYC** — Passport is not Know Your Customer; it does not perform or replace KYC.
- **Not revocation** — Passport has no revocation mechanism; history is append-only.
- **Not access control** — Passport does not grant or deny access to systems or resources.
- **Not governance** — Passport does not define or enforce governance over participants.
- **Not a token** — Passport is not a token, credential, or transferable asset.
