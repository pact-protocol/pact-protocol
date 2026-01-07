# PACT Protocol

PACT is a **deterministic negotiation and settlement protocol** for autonomous agents.

It defines *how agents find counterparties, negotiate terms, and settle value* — **before** any market trade, payment, or execution occurs.

PACT is intentionally narrow in scope. It does not move money, custody assets, or clear trades.  
It decides **who to transact with, on what terms, and under which settlement guarantees**.

---

## 1. What PACT Is (and Is Not)

### PACT is **not**:
- A marketplace
- An order book
- A payment rail
- A wallet or custody system
- A pricing oracle

### PACT **is**:
- A negotiation protocol
- A counterparty selection engine
- A settlement coordination layer
- A fairness and verification mechanism for agent-to-agent trade

PACT sits **upstream of markets** and **downstream of intent**.

---

## 2. Design Principles

PACT is built around five non-negotiable principles:

### 1. Determinism
Given the same inputs, PACT produces the same result.
- No hidden randomness
- No ambient time
- All clocks are injected
- All decisions are reproducible

### 2. Explainability
Every decision can be explained:
- Why a provider was selected
- Why others were rejected
- Why a settlement mode was chosen
- Why a negotiation failed

Explainability is part of the protocol surface, not debug output.

### 3. Fairness
- Commit–reveal prevents information leakage
- Streaming prevents overpayment
- Reputation reflects realized outcomes, not promises

### 4. Composability
- Settlement modes are pluggable
- Directories are replaceable
- Execution environments are external

### 5. Minimalism
PACT does *only* what is required to safely negotiate and settle.
Everything else is explicitly out of scope.

---

## 3. Conceptual Overview

At a high level, PACT answers one question:

> "Who should I transact with, on what terms, and how do we ensure fairness?"

### High-Level Flow

```
INTENT
↓
Provider Discovery
↓
Offer Collection (ASK)
↓
Filtering & Scoring
↓
ACCEPT
↓
Settlement (Hash-Reveal or Streaming)
↓
RECEIPT
```

Every arrow represents a **signed, verifiable step**.

---

## 4. Negotiation Primitives

PACT defines a small set of message types.

### INTENT
Declares *what the buyer wants*.

Includes:
- Intent type (e.g. `weather.data`)
- Constraints (latency, freshness)
- Maximum price
- Urgency
- Allowed settlement modes

INTENT does **not** select a counterparty.

---

### ASK
A provider's offer in response to an INTENT.

Includes:
- Price
- SLA metadata
- Credential claims
- Bond requirements

ASK messages are evaluated, not trusted.

---

### ACCEPT
Finalizes the negotiation.

- Selects exactly one provider
- Locks price and settlement mode
- Transitions the protocol into settlement

After ACCEPT:
- Terms are immutable
- Settlement semantics cannot change

---

## 5. Settlement Modes

PACT currently supports two settlement modes.

### 5.1 Hash-Reveal (Atomic Settlement)

Used when:
- Data is discrete
- Atomic delivery is required
- Latency is critical

#### Flow

```
Provider commits hash(payload + nonce)
↓
Buyer locks funds
↓
Provider reveals payload + nonce
↓
Hash verified
↓
Funds released
↓
Receipt issued
```

This prevents:
- Front-running
- Payload substitution
- Early disclosure

---

### 5.2 Streaming (Continuous Settlement)

Used when:
- Data is continuous
- Buyer wants pay-as-you-go
- Early exit must be possible

#### Flow

```
ACCEPT
↓
Funds unlocked (budget only)
↓
Provider streams chunks
↓
Buyer pays per tick
↓
Either side may stop
↓
Receipt reflects partial fulfillment
```

Streaming is:
- Non-custodial
- Time-bounded
- Budget-constrained

Over-collection is impossible by construction.

---

## 6. Provider Discovery & Fanout

PACT supports **fanout acquisition**.

### Discovery Sources
- In-memory directories (testing)
- JSONL registries (persistent)
- Remote directories (future)

### Fanout Process

```
Directory lookup
↓
Candidate providers
↓
Credential filtering
↓
Reputation filtering
↓
Latency / region scoring
↓
Deterministic selection
```

Fanout size is capped by:
- Router decision
- Available providers

---

## 7. Explainable Acquire

Every acquire operation may return an explanation.

### Explain Levels

- `none` (default)
- `coarse` — human-readable decisions
- `full` — includes structured metadata and rejection reasons

#### Example (coarse)

```json
{
  "selected_provider": "providerA",
  "rejected": [
    { "provider": "providerB", "reason": "OUT_OF_BAND_PRICE" },
    { "provider": "providerC", "reason": "MISSING_CREDENTIAL" }
  ]
}
```

Explainability is deterministic and stable.

---

## 8. Reputation System

Reputation is derived from receipts, not claims.

Metrics include:

- Fulfillment success rate
- Partial vs full delivery
- Volume transacted
- Failure modes

Reputation affects:

- Provider ranking
- Future selection probability

There is no manual override.

---

## 9. Determinism Guarantees

PACT guarantees:

- No implicit `Date.now()`
- No global mutable state
- No environment-dependent behavior
- Explicit clocks everywhere

This enables:

- Simulation
- Auditing
- Clean-room verification
- Formal reasoning

---

## 10. Protocol Invariants

The following must always hold:

- Messages are verified before use
- Settlement mode cannot change after ACCEPT
- Funds never move without a receipt
- Streaming cannot exceed budget
- Receipts are immutable

If any invariant is violated, the implementation is incorrect.

---

## 11. v1 Guarantees

This section defines the exact guarantees for PACT v1.0. These are **contracts** that will not change within the v1 major version.

### 11.1 Supported Settlement Modes

PACT v1.0 supports exactly two settlement modes:

1. **`hash_reveal`** — Atomic commit-reveal settlement
   - Provider commits to `hash(payload + nonce)`
   - Provider reveals `payload + nonce`
   - Buyer verifies hash before payment release
   - Best for discrete, atomic deliveries

2. **`streaming`** — Continuous pay-as-you-go settlement
   - Provider streams chunks incrementally
   - Buyer pays per tick
   - Either side may stop early
   - Receipt reflects partial fulfillment
   - Best for continuous data or long-running tasks

**Guarantee**: These are the only settlement modes in v1.0. No additional modes will be added without a major version bump.

### 11.2 Provider Requirements

A provider **must** implement the following HTTP endpoints to be compatible with PACT v1.0:

#### Required Endpoints

1. **`POST /quote`**
   - Accepts: `ProviderQuoteRequest` (intent_id, intent_type, max_price, constraints, urgent)
   - Returns: `ProviderQuoteResponse` with a **signed ASK envelope**
   - The envelope must be signed with the provider's Ed25519 keypair
   - The `signer_public_key_b58` must match the provider's registered pubkey

2. **`POST /commit`** (hash_reveal mode only)
   - Accepts: `CommitRequest` (intent_id, payload_b64, nonce_b64)
   - Returns: `CommitResponse` with a **signed COMMIT envelope**
   - The envelope must contain `commit_hash_hex = SHA256(payload_b64 + nonce_b64)`
   - Must be signed with the provider's Ed25519 keypair

3. **`POST /reveal`** (hash_reveal mode only)
   - Accepts: `RevealRequest` (intent_id, payload_b64, nonce_b64, commit_hash_hex)
   - Returns: `RevealResponse` with a **signed REVEAL envelope** and `ok: boolean`
   - If hash verification fails, returns `ok: false, code: "FAILED_PROOF"`
   - Must be signed with the provider's Ed25519 keypair

4. **`POST /stream/chunk`** (streaming mode only)
   - Accepts: `StreamChunkRequest` (intent_id, seq, sent_at_ms)
   - Returns: `StreamChunkResponse` with a **signed STREAM_CHUNK envelope**
   - Must be signed with the provider's Ed25519 keypair
   - Sequence numbers start at 0 and increment

5. **`GET /health`** (optional but recommended)
   - Returns provider status and sellerId/pubkey

#### Signing Requirements

- All envelopes must use Ed25519 signatures (tweetnacl-compatible)
- All envelopes must include `envelope_version: "pact-envelope/1.0"`
- All envelopes must include `signer_public_key_b58` (base58-encoded public key)
- All envelopes must include `signature_b58` (base58-encoded signature)
- Signature is over `SHA256(canonical(message))`

**Guarantee**: These endpoints and signing requirements are stable in v1.0. Breaking changes require a major version bump.

### 11.3 Receipt Schema

A buyer receives a **Receipt** after settlement completes (or fails). The receipt schema is:

```typescript
{
  receipt_id: string;           // Format: "receipt-{intent_id}-{timestamp_ms}"
  intent_id: string;             // Matches the intent_id from negotiation
  buyer_agent_id: string;        // Buyer's agent identifier
  seller_agent_id: string;       // Seller's agent identifier (pubkey_b58)
  agreed_price: number;          // Price agreed in ACCEPT (positive number)
  fulfilled: boolean;            // true if delivery succeeded, false if failed
  latency_ms?: number;           // Optional: actual delivery latency
  failure_code?: FailureCode;    // Optional: present if fulfilled=false
  paid_amount?: number;          // Optional: actual amount paid (for streaming)
  ticks?: number;                // Optional: number of ticks (for streaming)
  chunks?: number;               // Optional: number of chunks (for streaming)
  timestamp_ms: number;          // Receipt generation timestamp
}
```

#### Receipt Verification Rules

1. **Immutability**: Receipts are immutable once created
2. **Determinism**: Same settlement outcome produces the same receipt
3. **Completeness**: All receipts include `intent_id`, `buyer_agent_id`, `seller_agent_id`, `agreed_price`, `fulfilled`, `timestamp_ms`
4. **Failure Codes**: If `fulfilled: false`, `failure_code` must be present and be a valid `FailureCode`
5. **Streaming Fields**: For streaming settlements, `paid_amount`, `ticks`, and `chunks` are present

**Guarantee**: The receipt schema is stable in v1.0. Fields will not be removed or change meaning without a major version bump.

### 11.4 Failure Modes and Codes

PACT v1.0 defines explicit failure codes. All failures are deterministic and enumerable.

#### Discovery / Selection Failures

- `DIRECTORY_EMPTY` — No providers available for the intent type
- `NO_PROVIDERS` — Directory returned no providers
- `NO_ELIGIBLE_PROVIDERS` — Providers existed but all were rejected

#### Identity / Verification Failures

- `PROVIDER_SIGNATURE_INVALID` — Provider envelope signature verification failed
- `PROVIDER_SIGNER_MISMATCH` — Signer pubkey doesn't match expected provider pubkey
- `UNTRUSTED_ISSUER` — Provider credential issuer not in trusted issuers list
- `FAILED_IDENTITY` — Identity verification failed

#### Policy / Constraint Failures

- `PROVIDER_MISSING_REQUIRED_CREDENTIALS` — Provider lacked required credentials
- `PROVIDER_QUOTE_POLICY_REJECTED` — Quote rejected by policy guard
- `PROVIDER_QUOTE_OUT_OF_BAND` — Price violated reference band constraints
- `FAILED_REFERENCE_BAND` — Quote price outside acceptable reference price band
- `QUOTE_OUT_OF_BAND` — Alternative code for out-of-band quotes

#### Settlement Failures

- `FAILED_ESCROW` — Insufficient funds or lock failure
- `FAILED_PROOF` — Commit/reveal hash verification failed
- `BUYER_STOPPED` — Buyer halted streaming early (not necessarily a provider fault)
- `HTTP_STREAMING_ERROR` — HTTP streaming endpoint failed
- `HTTP_PROVIDER_ERROR` — HTTP provider endpoint error
- `STREAMING_NOT_CONFIGURED` — Streaming policy not configured
- `NO_AGREEMENT` — No agreement found after ACCEPT
- `NO_RECEIPT` — No receipt generated after settlement

#### Other Failures

- `INVALID_POLICY` — Policy validation failed

**Guarantee**: These failure codes are stable in v1.0. New codes may be added, but existing codes will not change meaning or be removed without a major version bump.

### 11.5 Scope Boundaries

PACT v1.0 **does not**:

- Move money or custody assets
- Clear trades or settle payments
- Provide wallet functionality
- Implement market-making or order books
- Handle subjective quality disputes
- Support human-in-the-loop arbitration
- Provide cross-chain settlement

PACT v1.0 **does**:

- Negotiate terms deterministically
- Select providers based on policy
- Coordinate settlement execution
- Produce verifiable receipts
- Enforce cryptographic verification
- Track reputation from receipts

**Guarantee**: These boundaries are explicit. Features outside this scope will not be added to v1.0 without a major version bump.

---

## 12. Status

PACT is pre-1.0 and experimental.

The protocol surface is stabilizing.
Breaking changes require a major version bump.

See `PRE_PUBLISH.md` for release rules.

---

## 12. Compatibility Contract

This contract is technical, formal, and human — not legalese.

### Scope

This contract applies to:

- `@pact/sdk`
- `@pact/provider-adapter`
- the PACT protocol messages defined in this repository

It governs runtime behavior, protocol semantics, and error signaling.

### Stability Guarantees

The following are guaranteed to remain compatible within a major version:

#### 1. Protocol Message Semantics

- Message types (INTENT, ASK, ACCEPT, COMMIT, REVEAL, STREAM_CHUNK)
- Required and optional fields
- Verification rules (signatures, hashes, identity checks)
- Commit–reveal correctness guarantees

A message that is valid in vX.Y.Z will remain valid in vX.*.*.

#### 2. Settlement Semantics

- hash_reveal settlement behavior
- streaming settlement behavior
- Payment timing, budget exhaustion rules, and early termination semantics
- Receipt structure and meaning

Settlement results will not silently change meaning.

#### 3. Error Codes

- All documented error codes are stable identifiers
- Error codes will not change meaning within a major version
- New error codes may be added, but existing ones will not be repurposed

If behavior changes, it must surface as:

- a new error code, or
- a major version bump

#### 4. Determinism

Given identical:

- inputs,
- policy,
- registry state,
- and time source,

PACT will produce the same:

- provider selection,
- negotiation outcome,
- settlement result,
- and receipt.

No hidden randomness or implicit global state is introduced.

### Allowed Changes (Non-Breaking)

The following may change between minor or patch versions:

- Performance optimizations
- Additional optional metadata fields
- Additional explainability output
- New error codes
- Additional protocol features gated behind explicit flags

These changes must not alter existing behavior by default.

### Breaking Changes

Breaking changes require:

- a major version bump
- an explicit entry in CHANGELOG.md
- updated documentation
- updated tests

Examples of breaking changes:

- changing settlement math
- altering commit–reveal guarantees
- reinterpreting an existing error code
- modifying required message fields

### Test Alignment Guarantee

All compatibility guarantees are enforced by:

- automated tests,
- clean-room install validation,
- and cross-package integration tests.

Any deviation between documentation, tests, and runtime behavior is considered a defect.

### Non-Goals

The following are explicitly not guaranteed:

- backward compatibility across major versions
- economic outcomes (prices, provider availability)
- availability of third-party providers

PACT guarantees correctness, not market conditions.

---

## 📐 Appendix: Protocol Diagrams

### Negotiation Sequence

```
Buyer                         Provider
  |                               |
  |----------- INTENT ----------->|
  |                               |
  |<----------- ASK --------------|
  |                               |
  |----------- ACCEPT ------------|
  |                               |
  |==== Settlement Begins ========|
```

---

### Hash-Reveal Detail

```
Provider                    Buyer
  |                           |
  |-- commit(hash) ---------->|
  |                           |
  |<-- funds locked ----------|
  |                           |
  |-- reveal(payload) ------->|
  |                           |
  |<-- verify + release ------|
  |                           |
  |======= RECEIPT ===========|
```

---

### Streaming Detail

```
Provider                    Buyer
  |                           |
  |-- chunk #1 -------------->|
  |                           |
  |<-- pay tick --------------|
  |                           |
  |-- chunk #2 -------------->|
  |                           |
  |<-- pay tick --------------|
  |                           |
  |-- STOP (either side) ---->|
  |                           |
  |======= RECEIPT ===========|
```
