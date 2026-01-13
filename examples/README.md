# PACT Examples

This directory contains working examples demonstrating different PACT features.

## Running Examples

All examples require:
1. Provider server running (Terminal A): `PACT_DEV_IDENTITY_SEED=pact-provider-default-seed-v1 pnpm provider:serve`
2. Clean `.pact` directory: `rm -rf .pact` (optional, but recommended)

Then run examples from Terminal B.

## Example Scripts

### basic-happy/run.ts

**Command:** `pnpm example:happy`

**What it does:**
- Registers a provider in-memory
- Runs a simple acquisition
- Prints receipt and transcript path

**Expected outcome:**
- ✅ Acquisition successful
- Receipt with `fulfilled: true`
- Transcript saved to `.pact/transcripts/`

### timeout-streaming/run.ts

**Command:** `pnpm example:timeout`

**What it does:**
- Forces streaming mode
- Buyer stops after 1 tick
- Demonstrates early termination

**Expected outcome:**
- ✅ Acquisition successful (buyer stopped)
- Receipt with partial payment
- Transcript shows `BUYER_STOPPED` outcome

### dispute-refund/run.ts

**Command:** `pnpm example:dispute`

**What it does:**
- Creates a successful acquisition
- Opens a dispute
- Resolves dispute with refund
- Verifies balances

**Expected outcome:**
- ✅ Acquisition successful
- ✅ Dispute opened
- ✅ Dispute resolved with refund
- Balances updated correctly

### reconcile-pending/run.ts

**Command:** `pnpm example:reconcile`

**What it does:**
- Creates an async settlement in pending state
- Acquisition times out (expected)
- Calls `reconcile()` to update transcript
- Shows status transition: pending → committed

**Expected outcome:**
- ⚠️ Acquisition timed out (settlement still pending - expected)
- ✅ Reconciliation UPDATED
- Final status: committed
- Reconciliation event: pending → committed

## Transcripts

All examples save transcripts to `.pact/transcripts/` with filenames like:
- `intent-<timestamp>-<hash>.json`

Each transcript includes:
- Full negotiation history
- Settlement attempts
- Final outcome
- Receipt (if successful)

## Verifying Transcripts

After running examples, verify transcripts:

```bash
# Default mode: warnings for pending settlements
pnpm replay:verify -- .pact/transcripts

# Strict + terminal-only: skip pending, verify only terminal
pnpm replay:verify --strict --terminal-only -- .pact/transcripts
```

## Troubleshooting

**Example fails with "NO_ELIGIBLE_PROVIDERS":**
- Ensure provider server is running
- Check that examples use `InMemoryProviderDirectory` (they do by default)

**Reconcile example shows "Initial status: failed":**
- This means the settlement resolved too fast
- The example uses `forcePendingUntilPoll: 101` to force pending state
- If it still commits immediately, check `StripeLikeSettlementProvider` config

**Transcript verification shows warnings:**
- `CREDENTIAL_EXPIRED`: Expected for historical transcripts (warnings are ok)
- `SETTLEMENT_PENDING_UNRESOLVED`: Expected for pending transcripts (warnings in default mode)

## Next Steps

- Read [QUICKSTART.md](../docs/QUICKSTART.md) for detailed setup
- See [BUYER_GUIDE.md](../docs/BUYER_GUIDE.md) for buyer usage
- See [PROVIDER_GUIDE.md](../docs/PROVIDER_GUIDE.md) for provider setup

