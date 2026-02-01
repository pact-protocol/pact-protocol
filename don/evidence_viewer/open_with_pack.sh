#!/usr/bin/env bash
set -euo pipefail

# Resolve repo root from this script's location (don/evidence_viewer -> two levels up)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PACKS_DIR="${REPO_ROOT}/design_partner_bundle/packs"

if [[ $# -eq 0 ]]; then
  for zip in "$PACKS_DIR"/*.zip; do
    [[ -f "$zip" ]] && echo "$zip"
  done
else
  pack="$1"
  path="$PACKS_DIR/$pack"
  if [[ ! -f "$path" ]]; then
    echo "Not found: $path" >&2
    exit 1
  fi
  echo "$path"
fi

echo ""
echo "Start the viewer, then drag-drop this zip into the UI."
