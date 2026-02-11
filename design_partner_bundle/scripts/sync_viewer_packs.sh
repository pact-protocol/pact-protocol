#!/usr/bin/env bash
#
# Sync canonical demo packs from design_partner_bundle into the Evidence Viewer.
# The viewer demo dropdown loads ONLY from apps/evidence-viewer/public/packs/*.zip.
# Run this after verify_all.sh so the viewer always has current packs.
#
# Usage: from repo root: ./design_partner_bundle/scripts/sync_viewer_packs.sh
#        or from this dir: ./scripts/sync_viewer_packs.sh (requires REPO_ROOT)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="${REPO_ROOT:-$(cd "$BUNDLE_DIR/.." && pwd)}"
PACKS_SRC="$BUNDLE_DIR/packs"
TAMPER_SRC="$BUNDLE_DIR/demo/h5-golden/tamper/auditor_pack_semantic_tampered.zip"
VIEWER_PACKS="$REPO_ROOT/apps/evidence-viewer/public/packs"

if [ ! -d "$PACKS_SRC" ]; then
  echo "❌ Error: canonical packs dir not found: $PACKS_SRC"
  exit 1
fi

mkdir -p "$VIEWER_PACKS"

echo "Syncing viewer packs (canonical source: design_partner_bundle/packs)..."
for f in "$PACKS_SRC"/*.zip; do
  if [ -f "$f" ]; then
    name=$(basename "$f")
    cp "$f" "$VIEWER_PACKS/$name"
    echo "  ✓ $name"
  fi
done

if [ -f "$TAMPER_SRC" ]; then
  cp "$TAMPER_SRC" "$VIEWER_PACKS/auditor_pack_semantic_tampered.zip"
  echo "  ✓ auditor_pack_semantic_tampered.zip (from demo/h5-golden/tamper)"
fi

echo "Done. Viewer demo dropdown will load from $VIEWER_PACKS"
