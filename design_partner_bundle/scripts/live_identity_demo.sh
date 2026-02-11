#!/usr/bin/env bash
#
# Optional: start registry and run live issuance demo (requires .env.registry in repo root).
# NOT required for the offline 5-minute demo. Use this only to demo issuing anchors via the registry.
#
# Usage:
#   1. cp design_partner_bundle/.env.registry.example .env.registry   # in repo root
#   2. pnpm -C packages/registry gen:keys   # paste output into .env.registry
#   3. ./design_partner_bundle/scripts/live_identity_demo.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="${REPO_ROOT:-$(cd "$BUNDLE_DIR/.." && pwd)}"

if [ ! -f "$REPO_ROOT/.env.registry" ]; then
  echo "Missing .env.registry in repo root. Copy design_partner_bundle/.env.registry.example and set REGISTRY_ISSUER_* (pnpm -C packages/registry gen:keys)."
  exit 1
fi

echo "Starting registry on port 3099 (background)..."
cd "$REPO_ROOT"
pnpm -C packages/registry build 2>/dev/null || true
PORT=3099 pnpm -C packages/registry start &
REG_PID=$!
trap "kill $REG_PID 2>/dev/null || true" EXIT

echo "Waiting for registry..."
sleep 2

echo ""
echo "Registry running. To issue anchors (examples):"
echo "  ./scripts/issue_demo_platform_stripe.sh    # Stripe Verified for API provider"
echo "  ./scripts/issue_demo_enterprise_identity_bundle.sh   # Service Account + OIDC"
echo ""
echo "Then recompute snapshots with issued anchors and load pack + snapshot in viewer."
echo "Press Ctrl+C to stop the registry."
wait $REG_PID
