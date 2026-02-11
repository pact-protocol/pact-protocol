# Pact Passport Snapshot Schema v0

**Protocol Identifier**: pact-passport-snapshot/0.0  
**Status**: Draft  
**Scope**: Reputation snapshot for Pact entities; domain-scoped metrics keyed by signer + software attestation.

## 1. Overview

A passport snapshot aggregates reputation metrics for entities that participate in Pact transactions. Entities are identified by **Option B**: the composite of `signer_public_key_b58` and `software_attestation`. This yields a deterministic `entity_id` for deduplication and lookups.

### 1.1 Entity Identity

- **signer_public_key_b58**: Base58-encoded Ed25519 public key (same key used in transcript signatures).
- **software_attestation**: `agent_impl_id`, `agent_version`, optionally `model_id`, `build_hash`. When absent, use fallback `"unknown"` (e.g. `{ agent_impl_id: "unknown", agent_version: "unknown" }`).
- **entity_id**: Content hash of the canonical serialization of `(signer_public_key_b58, software_attestation)`. **Never includes domain_id.** Use stable JSON canonicalization. Format: `"entity-" + SHA256(canonical_payload).hex`.

### 1.2 Structure

- **entities**: Array sorted by `entity_id`. Entity identity (Option B) = `signer_public_key_b58` + `software_attestation` (or fallback `"unknown"`). Entity key/hash never includes `domain_id`.
- **entity**: `{ entity_id, signer_public_key_b58, software_attestation, domains }`.
- **domains**: Array sorted by `domain_id`. Each domain has: `domain_id`, `metrics`, `counts`, `confidence_interval`, `deltas`. Fault attribution (e.g. dispute blamed on BUYER) is a delta on the blamed entity's domain, not a synthetic `fault:*` domain.

### 1.3 Domain-Scoped Metrics

Per domain within each entity (`domain.metrics`):

| Field | Type | Description |
|-------|------|-------------|
| reliability_score | 0–100 | Overall reliability |
| calibration_score | 0–100 or null | Calibration (null if not computed) |
| variance_score | 0–100 or null | Variance (null if not computed) |
| dispute_rate | 0–1 | Fraction of transactions that resulted in disputes |
| outcome_negative_rate | 0–1 | Fraction of negative outcomes |
| freshness_score | 0–100 | Recency of evidence |

Domain also has: `confidence_interval`, `counts`, `deltas` (evidence impacts: `{ type, ref, magnitude }`).

### 1.4 Top-Level Fields

| Field | Description |
|-------|-------------|
| scoring_version | Version of scoring algorithm (e.g. boxer/0.1.0) |
| generated_at_ms | Unix timestamp when snapshot was generated |
| source_manifest_hashes | Array of manifest/transcript hashes that contributed |
| snapshot_id | Hash of canonical snapshot payload; format `snapshot-` + SHA256 hex |
| entities | Array of entity objects, sorted by entity_id. Each entity has `domains` array sorted by domain_id. |

### 1.5 Snapshot ID

`snapshot_id` MUST be computed as:

- Payload = canonical JSON of the snapshot with `snapshot_id` excluded (to avoid circular reference).
- `snapshot_id = "snapshot-" + SHA256(payload).hex`

Implementations MUST use the same canonicalization for both snapshot_id and entity_id.

## 2. Deltas

Each delta explains how a piece of evidence affected the entity's scores:

- **type**: Evidence type (e.g. `transcript`, `outcome_event`, `dispute`).
- **ref**: Reference to the artifact (e.g. transcript_id, outcome_event_id).
- **magnitude**: Impact on the score (signed or unsigned per implementation).

Deltas enable auditability and explainability for underwriting and compliance.
