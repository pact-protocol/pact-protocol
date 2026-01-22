#!/bin/bash
# Fixture Verification Script
#
# Verifies all fixtures according to their expected behavior:
# - Regular fixtures (failures/, success/): Must pass replay
# - Compromised fixtures (compromised/): Expected to fail replay (this is correct)

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "═══════════════════════════════════════════════════════════"
echo "  Fixture Verification"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Regular fixtures: Must pass replay
echo "📋 Verifying regular fixtures (must pass)..."
REGULAR_FAILED=0
for fixture in fixtures/failures/*.json fixtures/success/*.json; do
  if [ -f "$fixture" ]; then
    echo "  Checking $(basename "$fixture")..."
    if pnpm replay:v4 "$fixture" >/dev/null 2>&1; then
      echo "    ✅ Passed"
    else
      echo "    ❌ Failed (should pass)"
      REGULAR_FAILED=1
    fi
  fi
done

if [ $REGULAR_FAILED -eq 1 ]; then
  echo ""
  echo "❌ Some regular fixtures failed replay (unexpected)"
  exit 1
fi

echo ""
echo "✅ All regular fixtures passed"
echo ""

# Compromised fixtures: Expected to fail replay
echo "📋 Verifying compromised fixtures (expected to fail replay)..."
COMPROMISED_FAILED=0
for fixture in fixtures/compromised/*.json; do
  if [ -f "$fixture" ]; then
    echo "  Checking $(basename "$fixture")..."
    
    # Replay should fail (this is expected)
    if pnpm replay:v4 "$fixture" >/dev/null 2>&1; then
      echo "    ❌ Replay passed (should have failed)"
      COMPROMISED_FAILED=1
    else
      echo "    ✅ Replay failed (expected)"
      
      # DBL should succeed
      echo "    Checking DBL..."
      if pnpm judge:v4 "$fixture" >/dev/null 2>&1; then
        echo "    ✅ DBL succeeded (expected)"
      else
        echo "    ❌ DBL failed (should succeed)"
        COMPROMISED_FAILED=1
      fi
    fi
  fi
done

if [ $COMPROMISED_FAILED -eq 1 ]; then
  echo ""
  echo "❌ Some compromised fixtures did not behave as expected"
  exit 1
fi

echo ""
echo "✅ All compromised fixtures behaved as expected"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ All fixture verifications passed"
echo "═══════════════════════════════════════════════════════════"
