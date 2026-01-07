# Pact Negotiation Grammar v1

Protocol Identifier: pact/1.0
Status: Draft (Normative)
Scope: Machine-to-machine negotiation, commitment, exchange, and receipt under bounded, enforceable constraints.

1. Design Goals (Normative)

Pact exists to enable autonomous agents to reach binding agreements under strict constraints, without human intervention.

The protocol MUST:

1. Be deterministic and bounded
2. Prevent infinite negotiation
3. Enforce economic accountability
4. Be rail-agnostic
5. Minimize information leakage
6. Produce verifiable outcomes

The protocol MUST NOT:

1. Allow free-form negotiation
2. Allow subjective arbitration in v1
3. Allow mid-round human intervention
4. Leak private strategy or market intelligence

2. Core Concepts
2.1 Agent

An Agent is a persistent cryptographic identity represented by a public key and agent identifier.

2.2 Negotiation

A Negotiation is a finite state machine resulting in exactly one terminal outcome.

2.3 Intent

An Intent is a typed declaration of desired work, constraints, and maximum willingness to pay.

2.4 Agreement

An Agreement is a binding commitment formed prior to exchange, including escrow and proof requirements.

3. Protocol Versioning

Every message MUST include:

{
  "protocol_version": "pact/1.0"
}

Messages with incompatible versions MUST be rejected.

Backward compatibility is explicit, not assumed.

4. Identity Handshake (Phase 0)
4.1 Purpose

Establish cryptographic control and capability claims before negotiation.

4.2 Required Artifacts

Each agent MUST present:

1. agent_id
2. public_key
3. capability_claims
4. proof_of_control (signature)

Optional:
5. Zero-knowledge credential proofs
6. Attestation bundles

4.3 Enforcement

Negotiation MUST NOT proceed unless:

1. Signatures verify
2. Capabilities satisfy intent type
3. Admission requirements are met (bond, credential, or sponsorship)

Failure mode: REJECT_IDENTITY

5. Intent Declaration (Phase 1)
5.1 INTENT Message (Required)
{
  "type": "INTENT",
  "intent_id": "uuid",
  "resource": "weather.data",
  "scope": "NYC",
  "constraints": {
    "latency_ms": 50,
    "freshness_sec": 10
  },
  "max_price": 0.0001,
  "settlement_mode": "streaming",
  "expires_at": 1710000000
}

5.2 Rules
1. INTENT is typed, not conversational
2. expires_at is mandatory
3. Ambiguous or malformed intents MUST be rejected

Failure mode: REJECT_INTENT

6. Bid / Ask Loop (Phase 2)
6.1 Message Types
    ASK
    BID
    ACCEPT
    REJECT

6.2 ASK Message
{
  "type": "ASK",
  "price": 0.00012,
  "unit": "request",
  "latency_ms": 40,
  "valid_for_ms": 25,
  "bond_required": 0.00002
}

6.3 Rules (Normative)

1. Maximum rounds: 3
2. Quotes are firm within valid_for_ms
3. Messages outside schema are ignored and penalized
4. Negotiation MUST terminate by:
    ACCEPT
    REJECT
    TIMEOUT

Failure mode: TIMEOUT_NEGOTIATION

7. Pre-Settlement Lock (“Handshake”) (Phase 3)
7.1 Agreement Formation

Upon ACCEPT, an Agreement is formed:

{
  "agreement_id": "uuid",
  "intent_id": "uuid",
  "price": 0.00009,
  "bond": 0.00002,
  "delivery_deadline": 1710000050,
  "proof_type": "hash_reveal",
  "challenge_window_ms": 100
}

7.2 Requirements
1. Buyer MUST lock payment funds
2. Seller MUST lock bond
3. No exchange occurs before locks succeed

Failure mode: INSUFFICIENT_ESCROW

8. Atomic Exchange (Phase 4)
8.1 Supported Exchange Models
A. Commit → Reveal (Data)
1. Seller commits hash(payload || nonce)
2. Buyer escrows payment
3. Seller reveals payload + nonce
4. Buyer verifies hash

B. Streaming + Cutoff (Compute)
1. Buyer streams payments
2. Seller streams output
3. Either side may halt

8.2 Enforcement

Payment release MUST be conditional on verifiable proof.

Failure mode: INVALID_PROOF

9. Challenge & Slashing
9.1 Objective Challenges Only (v1)

Seller MAY be slashed if:
1. Delivery missed deadline
2. Proof invalid
3. Payload hash mismatch
4. SLA violation (latency / freshness)

Buyer MAY be penalized if:
1. Frivolous challenge
2. Failure to ACK valid delivery

9.2 Resolution Output
{
  "type": "RESOLUTION",
  "winner": "buyer",
  "slashed_amount": 0.00002,
  "reason": "INVALID_PROOF"
}

Subjective quality disputes are out of scope for v1.

10. Receipt Emission (Phase 5)
10.1 RECEIPT Message
{
  "type": "RECEIPT",
  "agent_a": "agent_pubkey_a",
  "agent_b": "agent_pubkey_b",
  "intent": "weather.data",
  "price": 0.00009,
  "fulfilled": true,
  "latency_ms": 42,
  "timestamp": 1710000060
}

10.2 Properties
1. Receipts MUST be signed
2. Receipts MAY be aggregated
3. Receipts MAY be ZK-compressed
4. Receipts are protocol-specific and non-portable

11. Anti-Gaming Enforcement (Normative)

The protocol enforces:
1. Admission friction (bond / credential)
2. Rate limits by intent-type
3. Progressive friction for new agents
4. Firm quote accountability
5. Economic penalties for timeouts
6. Reputation dampening for collusion

Gaming MUST be made uneconomic, not forbidden.

12. Policy Layer (Non-Normative, Enforced)

Policies MAY restrict:
1. Reputation thresholds
2. SLA strictness
3. Negotiation rounds
4. Bond multipliers
5. Execution modes

Policies configure boundaries, not decisions.

13. Deterministic Failure Modes (Exhaustive)

Every negotiation MUST end in exactly one:

    ACCEPTED
    REJECTED
    TIMEOUT
    FAILED_IDENTITY
    FAILED_ESCROW
    FAILED_PROOF

No hanging states are permitted.

14. Security Properties

Pact guarantees:

1. No infinite negotiation
2. No free probing
3. No trust without stake
4. No payment without proof
5. No negotiation without identity

Pact does not guarantee:

1. Lowest possible price
2. Subjective correctness
3. Human override safety

15. Final Principle (Normative)

Pact defines the grammar of machine agreements.
Agents may innovate on strategy, but must speak the language.