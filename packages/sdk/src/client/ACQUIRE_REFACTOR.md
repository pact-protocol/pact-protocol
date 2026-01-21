# Acquire() Refactor Plan: Phase/Event Pipeline

## Overview

The `acquire()` function has been refactored to use a phase/event pipeline architecture with:
- **Event/Evidence interface**: Types defined in `events.ts`
- **Central EventRunner**: Centralized event emission, idempotency, and history tracking
- **Centralized retry + idempotency + failure mapping**: In `event_runner.ts`
- **Preserved atomic commit gate**: Settlement operations still atomic
- **Preserved transcript ordering**: Events emitted in sequence maintain transcript order

## Architecture

### Event Flow

```
acquire() 
  → EventRunner (creates event context)
  → Phase Handlers (emit events)
    → Policy Validation Phase → emitSuccess/emitFailure
    → Provider Discovery Phase → emitProgress/emitSuccess
    → Provider Evaluation Phase → emitSuccess/emitFailure (per provider)
    → Negotiation Phase → emitSuccess/emitFailure
    → Settlement Phase → emitSuccess/emitFailure (atomic commit gate preserved)
  → Transcript Commit Phase → emitSuccess (ensures ordering)
```

### Key Components

1. **EventRunner** (`event_runner.ts`):
   - Central `emitEvent()` function
   - Idempotency checking via `idempotencyStore`
   - Event history tracking
   - Evidence collection

2. **Events** (`events.ts`):
   - `AcquisitionEvent` union type (SuccessEvent | FailureEvent | ProgressEvent)
   - `EventEvidence` interface for auditability
   - `AcquisitionPhase` enum for phase identification

3. **Failure Mapping** (`event_runner.ts`):
   - `isRetryableFailureCode()` centralizes retry logic
   - Replaces scattered `isRetryableFailure()` calls

## Integration Points

### 1. Initialize EventRunner

```typescript
import { EventRunner, isRetryableFailureCode, createEvidence } from "./event_runner";
import type { AcquisitionPhase } from "./events";

// In acquire(), after intent ID generation:
const eventRunner = new EventRunner(intentId, nowFunction());

// Register transcript handler to maintain ordering
eventRunner.on(async (event) => {
  // Append to transcript data in event order (preserves sequence)
  if (transcriptData && event.phase === "transcript_commit") {
    // Commit transcript atomically (preserves atomic gate)
    await transcriptStore.writeTranscript(intentId, transcriptData);
  }
});
```

### 2. Phase Wrappers

Each major phase should emit events:

#### Policy Validation Phase
```typescript
// Before: Direct return on failure
if (!validated.ok) {
  return { ok: false, code: "INVALID_POLICY", ... };
}

// After: Emit failure event, then return
const policyEvent = await eventRunner.emitFailure(
  "policy_validation",
  "INVALID_POLICY",
  `Policy validation failed: ${validated.errors.join(", ")}`,
  false // not retryable
);
if (policyEvent.type === "failure") {
  return { ok: false, code: policyEvent.failure_code, ... };
}
```

#### Provider Evaluation Phase
```typescript
// Before: Scattered failure handling
if (!hasAllCreds) {
  failureCodes.push(code);
  continue;
}

// After: Emit failure event, check retryability
const failureEvent = await eventRunner.emitFailure(
  "provider_evaluation",
  "PROVIDER_MISSING_REQUIRED_CREDENTIALS",
  `Missing required credentials: ...`,
  isRetryableFailureCode("PROVIDER_MISSING_REQUIRED_CREDENTIALS")
);
// Continue evaluation loop...
```

#### Settlement Phase (Atomic Commit Gate Preserved)
```typescript
// Before: Direct session.onCommit() call
const commitResult = await session.onCommit(commitEnvelope);

// After: Emit progress before commit, then commit atomically
await eventRunner.emitProgress(
  "settlement_commit",
  0.5,
  "Preparing settlement commit"
);

// Atomic commit gate preserved: commit still happens atomically
const commitResult = await session.onCommit(commitEnvelope);

if (!commitResult.ok) {
  await eventRunner.emitFailure(
    "settlement_commit",
    commitResult.code,
    commitResult.reason,
    isRetryableFailureCode(commitResult.code)
  );
} else {
  await eventRunner.emitSuccess(
    "settlement_commit",
    { commit_hash: commitHash },
    [createEvidence("settlement_commit", "commit_hash", { hash: commitHash })]
  );
}
```

### 3. Retry Logic Integration

```typescript
// Before: Scattered retry checks
if (!isRetryableFailure(failureCode)) {
  return "return";
}

// After: Centralized via EventRunner
const failureEvent = await eventRunner.emitFailure(
  phase,
  failureCode,
  reason,
  isRetryableFailureCode(failureCode) // Centralized mapping
);

if (!failureEvent.retryable) {
  return { ok: false, code: failureEvent.failure_code, ... };
}
// Continue to next candidate...
```

### 4. Transcript Ordering Preservation

Events are emitted in sequence (`sequence` field is monotonic). Transcript commit handler ensures events are written in order:

```typescript
eventRunner.on(async (event) => {
  // Events arrive in sequence order (guaranteed by EventRunner)
  // Transcript data is built incrementally from events
  if (event.phase === "transcript_commit") {
    // Final commit happens after all settlement events
    // This preserves the atomic commit gate: transcript only written after settlement succeeds
    await transcriptStore.writeTranscript(event.intent_id, transcriptData);
  }
});
```

## Migration Strategy

Given the size of `acquire.ts` (4000+ lines), refactor incrementally:

1. **Phase 1**: ✅ Add EventRunner initialization, wrap policy validation
2. **Phase 2**: ✅ Wrap provider discovery/evaluation phases
   - Provider discovery emits progress and success/failure events
   - Provider evaluation emits one event per provider (success if eligible, failure if rejected)
3. **Phase 3**: Wrap negotiation phase
4. **Phase 4**: Wrap settlement phases (preserve atomic gates)
5. **Phase 5**: Add transcript commit phase handler

Each phase can be tested independently to ensure semantic preservation.

## Current Status

**Completed:**
- ✅ EventRunner initialization
- ✅ Policy validation phase wrapped with events
- ✅ Provider discovery phase wrapped with events (progress + success/failure)
- ✅ Provider evaluation phase wrapped with events (one event per provider, success/failure)
- ✅ Negotiation phase wrapped with events (start/round/end)

Provider discovery and evaluation are now fully integrated with EventRunner. Each provider discovery operation emits a progress event at start, a success event with candidate counts and evidence on completion, or a failure event if no providers are found. Each provider evaluation emits individual success/failure events with detailed evidence (credential checks, trust scores, quote validation, negotiation policy checks). These events are deterministic, use sequential event IDs, and preserve transcript ordering. Evidence is collected incrementally and attached to events for auditability.

Negotiation is now eventized (start/round/end) via EventRunner. The negotiation phase emits:
- `NEGOTIATION_START` event before negotiation begins with metadata (intent_type, max_rounds, regime, settlement_mode, strategy)
- `NEGOTIATION_ROUND` events for each negotiation round with deterministic event IDs (`negotiation:round:${intentId}:${round_index}`)
- `NEGOTIATION_END` event after negotiation completes with outcome_code, rounds_used, and agreed_price
- Evidence is collected per round and in summary form
- No semantic changes; transcript ordering preserved

Hash_reveal settlement is now eventized via EventRunner (start/prepare/commit/reveal/complete/fail). The settlement phase emits:
- `SETTLEMENT_START` event before hash_reveal settlement begins with metadata (mode, asset, chain)
- `SETTLEMENT_PREPARE` event around commit/reveal preparation with provider_id and price
- `SETTLEMENT_COMMIT_ATTEMPT` events for each commit attempt with deterministic event IDs (`settlement:commit:${intentId}:${attempt_index}`)
- `SETTLEMENT_REVEAL_ATTEMPT` events for each reveal attempt with deterministic event IDs (`settlement:reveal:${intentId}:${attempt_index}`)
- `SETTLEMENT_COMPLETE` event on success (before transcript commit) with receipt metadata
- `SETTLEMENT_FAIL` event on terminal failure with failure code
- Evidence is collected for prepare, commit attempts, reveal attempts, and completion
- Atomic commit gate preserved; tests enforce ordering (settlement events before transcript_commit)
- No semantic changes; transcript ordering preserved

**Remaining:**
- ⏳ Streaming settlement phase
- ⏳ Stripe_like settlement phase
- ⏳ Reconciliation phase (if present)
- ⏳ Disputes/arbitration artifacts phase (if present)

Streaming and stripe_like settlement phases remain unwrapped and will be migrated to EventRunner in subsequent passes. The atomic commit gate for settlement is preserved and will be maintained when these phases are wrapped.

## Semantic-Preserving Refactor Contract

**CRITICAL:** Before wrapping more phases, the following invariants MUST be preserved:

### Contract Tests

1. **Transcript Order Invariant**
   - Transcript rounds must be in identical order vs baseline
   - Same input → same transcript structure
   - Events must match transcript ordering

2. **Retry Invariant**
   - No additional retries introduced
   - Same failure code → same retry decision
   - Retry count must remain unchanged

3. **Error Code/Terminality Invariant**
   - Error codes must remain unchanged
   - Terminality (success/failure) must remain unchanged
   - Failure modes must map identically

4. **Atomic Commit Gate Invariant**
   - Settlement success → transcript success (atomic)
   - Settlement failure → transcript failure (atomic)
   - No partial states (settlement succeeds but transcript shows failure)
   - Transcript "seal" event only after settlement completes

See `acquire_refactor_contract.test.ts` and `atomic_commit_gate.test.ts` for contract tests.

## Testing

All existing tests should pass without modification (semantic-preserving refactor). New tests can verify:
- Event sequence ordering
- Idempotency behavior
- Evidence collection
- Failure mapping correctness
- Semantic-preserving contract (transcript order, retry count, error codes)
- Atomic commit gate (settlement ↔ transcript atomicity)

## Benefits

1. **Centralized retry logic**: Single source of truth for retryability
2. **Event-driven debugging**: Full event history for troubleshooting
3. **Evidence collection**: Structured evidence for auditability
4. **Idempotency**: Built-in idempotency checks prevent duplicate work
5. **Maintainability**: Clear phase boundaries, easier to modify/extend
