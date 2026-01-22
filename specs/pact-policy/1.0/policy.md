# Pact Policy Schema v1

**Identifier:** `pact-policy/1.0`  
**Applies to:** Buyer-side and Seller-side runtimes

## Overview

A Pact runtime MUST reject any negotiation/action that violates its active policy. The policy is a JSON object conforming to the schema in `schema.json`.

## Policy Structure

Required top-level fields:
- `policy_version`: `"pact-policy/1.0"` (const)
- `policy_id`, `name`, `mode`, `created_at_ms`, `updated_at_ms`
- `time`, `admission`, `negotiation`, `counterparty`, `sla`, `economics`, `settlement`, `anti_gaming`, `observability`, `overrides`

## Enforcement Map

- **Time**: Clock skew bounds, expiry enforcement, valid_for_ms constraints
- **Admission**: One-of gate (bond/credential/sponsor), session spend caps, intent allowlists, new-agent restrictions
- **Negotiation**: Max rounds, duration limits, firm quote validation, action allowlists
- **Counterparty**: Reputation, credentials, region filters, failure/timeout rates, intent-specific overrides
- **SLA**: Latency, freshness, schema validation, penalties
- **Economics**: Reference pricing bands, bonding requirements, timeout fees
- **Settlement**: Allowed modes, pre-lock requirements, streaming caps
- **Anti-gaming**: Rate limits, quote accountability, collusion detection
- **Observability**: Receipt emission, transcript storage, explanation detail
- **Overrides**: Kill switches, budget caps, policy swaps

## Schema

See `schema.json` for complete JSON Schema definition with all field constraints.
