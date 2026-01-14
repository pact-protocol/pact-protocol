# PACT Quickstart Guide

Get PACT running in under 10 minutes.

## Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0

## Fresh Clone: 5-Minute Green Check

**For a new developer verifying the repo works:**

```bash
# Install dependencies
pnpm install

# Run release gate (builds, tests, packs, runs examples, verifies transcripts)
pnpm release:gate
```

**If release:gate passes, you're synced and ready to go! ✅**

**Optional: Run examples manually (requires provider server):**

In **Terminal A**:
```bash
PACT_DEV_IDENTITY_SEED=pact-provider-default-seed-v1 pnpm provider:serve
```

In **Terminal B**:
```bash
# Clean up any previous transcripts
rm -rf .pact

# Run all examples
pnpm examples:all

# Verify transcripts (strict + terminal-only)
pnpm replay:verify:strict-terminal
```

## Setup (2 minutes)

**Before starting, clean up any previous artifacts:**

```bash
rm -rf .pact
```

Then:

```bash
# Install dependencies
pnpm install

# Build packages
pnpm build

# Verify installation
pnpm test
```

## Run Your First Transaction (5 minutes)

### Step 1: Start Provider Server

In **Terminal 1**:

```bash
PACT_DEV_IDENTITY_SEED=pact-provider-default-seed-v1 pnpm provider:serve
```

You should see:
```
[Provider Server] sellerId: 8MAHFtsAtkENKMukXZoRUhNXCtJExDHEsUPSR19rjBDp
[Provider Server] Started on http://127.0.0.1:7777
[Provider Server] Identity mode: dev-seed
```

**Note:** The `sellerId` will be the same every time with the deterministic seed.

### Step 2: Register Provider

**Option A: Use example registry (recommended for quick start):**

```bash
cp providers.example.jsonl providers.jsonl
```

**Option B: Register manually:**

In **Terminal 2**:

```bash
pnpm provider:register -- \
  --intent weather.data \
  --pubkey 8MAHFtsAtkENKMukXZoRUhNXCtJExDHEsUPSR19rjBDp \
  --endpoint http://127.0.0.1:7777 \
  --credentials sla_verified \
  --region us-east \
  --baselineLatencyMs 50
```

This creates/updates `providers.jsonl` in the repo root.

**See `providers.example.jsonl` for a valid registry entry format.**

### Step 3: Run Happy Demo

```bash
pnpm demo:happy
```

**Expected output:**
- Provider discovery
- Credential verification
- Quote negotiation
- Settlement execution (hash_reveal)
- Receipt with balances
- Transcript saved to `.pact/transcripts/`

### Step 4: Run Timeout Demo

```bash
pnpm demo:timeout
```

This demonstrates a timeout scenario where negotiation fails.

## Examples

**Before running examples, clean up previous transcripts:**

```bash
rm -rf .pact
```

PACT includes several example scripts to demonstrate different features:

### Basic Happy Path

```bash
pnpm example:happy
```

Runs a simple acquisition against the registry and prints the receipt.

### Timeout Streaming

```bash
pnpm example:timeout
```

Forces streaming mode with buyer stop after 1 tick.

### Dispute & Refund

```bash
pnpm example:dispute
```

Creates a dispute, resolves it, executes a refund, and verifies balances.

### Reconcile Pending

```bash
pnpm example:reconcile
```

Creates an async stripe_like settlement in pending state, then calls `reconcile()` to update the transcript.

## Verify Transcripts

After running demos or examples, transcripts are saved to `.pact/transcripts/`.

To verify transcripts:

```bash
# Verify all transcripts in directory (default mode: warnings for pending settlements)
pnpm replay:verify -- .pact/transcripts

# Strict mode: Treat pending settlements without resolution as errors
# Use strict mode only when you expect all settlements to be resolved
pnpm replay:verify --strict -- .pact/transcripts

# Strict + terminal-only: Skip pending transcripts, verify only terminal ones
# Useful when folder contains both pending snapshots and reconciled snapshots
pnpm replay:verify --strict --terminal-only -- .pact/transcripts

# Verify a single transcript
pnpm replay:verify -- .pact/transcripts/intent-123-1234567890-abc123.json
```

**Verification Modes:**

| Mode | Pending Transcript | Terminal Transcript |
|------|-------------------|---------------------|
| **default** | WARN | OK |
| **strict** | ERROR | OK |
| **strict + terminal-only** | SKIP (WARN) | OK |

**Understanding Warnings:**
- `CREDENTIAL_EXPIRED`: Expected for historical transcripts. Credentials expire over time, so this is normal for old transcripts.
- `SETTLEMENT_PENDING_UNRESOLVED`: Expected for transcripts where settlement is still pending. In default mode, this is a warning (not an error). Use `--strict` only when you expect all settlements to be resolved.
- `transcript_version missing`: Older transcripts may not have version field. This is a warning, not an error.

**When to use each mode:**
- **Default mode**: Use for general verification. Warnings are informational.
- **Strict mode**: Use for production verification when you expect all settlements to be resolved.
- **Strict + terminal-only**: Use when verifying folders containing both pending snapshots and reconciled snapshots. Skips pending files and verifies only terminal ones.

## Check Environment

Run the doctor command to check your environment:

```bash
pnpm doctor
```

This verifies:
- Node.js and pnpm versions
- Workspace installation
- Provider registry existence
- Provider endpoint reachability
- Deterministic seed configuration

## Next Steps

- Read `README.md` for detailed documentation
- Check `PROTOCOL.md` for protocol semantics
- Explore `examples/` folder for more examples
- Review `RECAP.md` for a comprehensive overview

## Troubleshooting

**Provider not found:**
- Ensure provider server is running (Terminal 1)
- Verify provider is registered: `pnpm provider:list -- --intent weather.data`
- Check `providers.jsonl` exists and contains your provider

**Settlement fails:**
- Verify provider server is responding: `curl http://127.0.0.1:7777/health`
- Check provider server logs for errors

**Transcript verification fails:**
- Ensure transcript file exists
- Check transcript version (should be "1.0" for new transcripts)
- Run `pnpm replay:verify` with `--` separator

## Tips

- Use `PACT_DEV_IDENTITY_SEED` for deterministic demo identities
- Transcripts are saved to `.pact/transcripts/` (git-ignored)
- Provider registry is `providers.jsonl` at repo root
- All examples write transcripts automatically


