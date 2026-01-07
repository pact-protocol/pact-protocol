# Pact Compliance Spec v1

**Identifier:** `pact-compliance/1.0`  
**Applies to:** Pact runtimes and SDKs claiming Pact v1 enforcement  
**Protocol:** `pact/1.0` | **Policy:** `pact-policy/1.0`

## Scope

Defines compliance for:
- **Grammar v1**: Correct message language
- **Policy v1**: Deterministic policy enforcement
- **Runtime v1**: Objective outcomes with receipts

## Terminal Outcomes

Every negotiation MUST terminate in exactly one:
- `ACCEPTED`, `REJECTED`, `TIMEOUT`, `FAILED_IDENTITY`, `FAILED_ADMISSION`, `FAILED_ESCROW`, `FAILED_PROOF`, `FAILED_SLA`, `FAILED_POLICY`, `FAILED_BUDGET`

## Enforcement by Phase

- **Identity**: Signature/identity verification, timestamp/expiry checks, issuer trust
- **Intent**: Intent structure, kill switches, budget caps, admission gates, rate limits
- **Negotiation**: Round/duration bounds, action allowlists, firm quote rules, counterparty filters, reference bands
- **Lock**: Settlement mode validation, bond requirements, pre-lock enforcement
- **Exchange**: Proof validation, schema checks, SLA constraints, streaming caps
- **Resolution**: Receipt emission, transcript storage limits

## Test Vectors

See `/specs/pact-compliance/1.0/vectors/` for compliance test vectors covering all enforcement categories.
