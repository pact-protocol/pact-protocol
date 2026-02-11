#!/usr/bin/env bash
#
# Offline revocation demo: use precomputed passport_api_revoked.json.
# No registry required. Shows trust degraded, evidence still valid.
#
# Usage: run verify_all.sh and start the viewer, then:
#   1. In viewer: Load Demo Pack → "Autonomous API Procurement (Success)"
#   2. Load Passport Snapshot → select design_partner_bundle/fixtures/snapshots/passport_api_revoked.json
#   3. Point out: global revocation banner, ⚠ on party with revoked anchor, Party modal "Revoked" status
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SNAPSHOT="$BUNDLE_DIR/fixtures/snapshots/passport_api_revoked.json"

if [ ! -f "$SNAPSHOT" ]; then
  echo "Precomputed snapshot not found. Run from repo root:"
  echo "  ./design_partner_bundle/scripts/recompute_snapshots.sh"
  exit 1
fi

echo "Offline revocation demo (no registry)"
echo "  Snapshot: $SNAPSHOT"
echo ""
echo "Steps:"
echo "  1. Start viewer: pnpm --filter @pact/evidence-viewer dev"
echo "  2. Load pack: Autonomous API Procurement (Success)"
echo "  3. Load Passport Snapshot → $SNAPSHOT"
echo "  4. Check: global banner 'identity attestations revoked', ⚠ on Provider B, Party modal shows Revoked + reason"
echo ""
echo "Evidence remains verified; trust signals are degraded (Future use not recommended)."
