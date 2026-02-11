#!/usr/bin/env bash
# Issue demo anchors for art + api pilots; write fixtures/anchors/issued_<date>.json.
# Requires: pnpm -C packages/registry build; REGISTRY_ISSUER_* env vars (or run gen_registry_keys.mjs and source).

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if [ -z "$REGISTRY_ISSUER_PUBLIC_KEY_B58" ] || [ -z "$REGISTRY_ISSUER_SECRET_KEY_B58" ]; then
  echo "Registry issuer keys not set. Generate with: node scripts/gen_registry_keys.mjs"
  echo "Then: export REGISTRY_ISSUER_PUBLIC_KEY_B58=... REGISTRY_ISSUER_SECRET_KEY_B58=..."
  exit 1
fi

pnpm -C packages/registry build 2>/dev/null || true
node scripts/issue_demo_anchors.mjs

echo ""
echo "To use with Boxer:"
echo "  node packages/boxer/dist/cli/recompute.js --pack design_partner_bundle/packs/auditor_pack_art_success.zip --anchors fixtures/anchors/issued_$(date +%Y-%m-%d).json --out /tmp/passport_art_v0_4.json"
