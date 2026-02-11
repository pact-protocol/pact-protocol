#!/usr/bin/env bash
#
# Regenerate passport snapshots offline (Boxer + anchor fixtures).
# No registry or network required. Outputs go to design_partner_bundle/fixtures/snapshots/.
#
# Usage: from repo root: ./design_partner_bundle/scripts/recompute_snapshots.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="${REPO_ROOT:-$(cd "$BUNDLE_DIR/.." && pwd)}"
OUT_DIR="$BUNDLE_DIR/fixtures/snapshots"
BOXER="$REPO_ROOT/packages/boxer/dist/cli/recompute.js"
PACKS="$BUNDLE_DIR/packs"
ANCHORS_REPO="$REPO_ROOT/fixtures/anchors"
ANCHORS_BUNDLE="$BUNDLE_DIR/fixtures/anchors"

mkdir -p "$OUT_DIR"

if [ ! -f "$BOXER" ]; then
  echo "Building Boxer..."
  pnpm --filter @pact/boxer run build
fi

echo "Recomputing snapshots (offline) into $OUT_DIR..."
echo ""

# Art Acquisition — credentialed experts
if [ -f "$PACKS/auditor_pack_art_success.zip" ] && [ -f "$ANCHORS_REPO/art_anchors.json" ]; then
  node "$BOXER" --pack "$PACKS/auditor_pack_art_success.zip" \
    --anchors "$ANCHORS_REPO/art_anchors.json" \
    --out "$OUT_DIR/passport_art_enterprise.json"
  echo "  ✓ passport_art_enterprise.json"
else
  echo "  ⚠ Skip art: pack or art_anchors.json missing"
fi

# API Procurement — enterprise identity
if [ -f "$PACKS/auditor_pack_api_success.zip" ] && [ -f "$ANCHORS_REPO/api_anchors.json" ]; then
  node "$BOXER" --pack "$PACKS/auditor_pack_api_success.zip" \
    --anchors "$ANCHORS_REPO/api_anchors.json" \
    --out "$OUT_DIR/passport_api_enterprise.json"
  echo "  ✓ passport_api_enterprise.json"
else
  echo "  ⚠ Skip API enterprise: pack or api_anchors.json missing"
fi

# API with one revoked anchor — trust degraded demo
if [ -f "$PACKS/auditor_pack_api_success.zip" ] && [ -f "$ANCHORS_BUNDLE/api_anchors_revoked.json" ]; then
  node "$BOXER" --pack "$PACKS/auditor_pack_api_success.zip" \
    --anchors "$ANCHORS_BUNDLE/api_anchors_revoked.json" \
    --out "$OUT_DIR/passport_api_revoked.json"
  echo "  ✓ passport_api_revoked.json"
else
  echo "  ⚠ Skip API revoked: pack or api_anchors_revoked.json missing"
fi

echo ""
echo "Done. Load these in the viewer: pack first, then Load Passport Snapshot (JSON)."
