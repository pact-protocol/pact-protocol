# Fixture Verification Guide

This guide documents how to verify fixtures in CI and local development.

## Fixture Categories

### Regular Fixtures (`fixtures/failures/`, `fixtures/success/`)

**Expected behavior:** Must pass replay verification

```bash
# All regular fixtures must pass
pnpm replay:v4 fixtures/failures/*.json
pnpm replay:v4 fixtures/success/*.json

# Expected: Exit code 0 (all pass)
```

### Compromised Fixtures (`fixtures/compromised/`)

**Expected behavior:** Replay MUST fail (exit code 1) - this is intentional

```bash
# Compromised fixtures are EXPECTED to fail replay
pnpm replay:v4 fixtures/compromised/*.json

# Expected: Exit code 1 (integrity compromised) ✅ **This is correct**
```

**Why they fail:**
- These fixtures have intentionally corrupted `final_hash` values
- Replay correctly detects container hash mismatch
- This tests error handling and robustness

**Verification pattern:**
```bash
# For each compromised fixture:
# 1. Replay should fail (expected)
pnpm replay:v4 fixtures/compromised/PACT-404-settlement-timeout-finalhash-mismatch.json
# Expected exit code: 1 ✅

# 2. DBL should succeed (expected)
pnpm judge:v4 fixtures/compromised/PACT-404-settlement-timeout-finalhash-mismatch.json
# Expected exit code: 0 ✅

# 3. Replay with --allow-compromised should succeed (if only FINAL_HASH_MISMATCH)
pnpm replay:v4 --allow-compromised fixtures/compromised/PACT-404-settlement-timeout-finalhash-mismatch.json
# Expected exit code: 0 (if only FINAL_HASH_MISMATCH, rounds valid) ✅
```

## CI Verification Script Pattern

For automated verification in CI:

```bash
#!/bin/bash
set -e

# Regular fixtures: Must pass
echo "Verifying regular fixtures..."
for fixture in fixtures/failures/*.json fixtures/success/*.json; do
  if [ -f "$fixture" ]; then
    echo "Checking $fixture..."
    pnpm replay:v4 "$fixture" || {
      echo "❌ Regular fixture failed: $fixture"
      exit 1
    }
  fi
done

# Compromised fixtures: Expected to fail (exit code 1)
echo "Verifying compromised fixtures (expected failures)..."
for fixture in fixtures/compromised/*.json; do
  if [ -f "$fixture" ]; then
    echo "Checking $fixture (expected to fail)..."
    pnpm replay:v4 "$fixture" && {
      echo "❌ Compromised fixture should have failed: $fixture"
      exit 1
    } || {
      echo "✅ Compromised fixture correctly failed: $fixture"
    }
    
    # DBL should still succeed
    echo "  Verifying DBL succeeds..."
    pnpm judge:v4 "$fixture" || {
      echo "❌ DBL should succeed on compromised fixture: $fixture"
      exit 1
    }
    echo "  ✅ DBL succeeded"
  fi
done

echo "✅ All fixture verifications passed"
```

## Quick Reference

| Fixture Type | Replay (default) | Replay (--allow-compromised) | DBL (judge-v4) |
|--------------|------------------|------------------------------|----------------|
| Regular (`failures/`, `success/`) | Exit 0 ✅ | N/A | Exit 0 ✅ |
| Compromised (`compromised/`) | Exit 1 ✅ **Expected** | Exit 0 (if only FINAL_HASH_MISMATCH) | Exit 0 ✅ |

## See Also

- [`compromised/README.md`](./compromised/README.md) - Detailed compromised fixture documentation
- [`compromised/RULES_OF_EVIDENCE.md`](./compromised/RULES_OF_EVIDENCE.md) - Rules of evidence for compromised fixtures
