#!/usr/bin/env bash
# Issue service_account_verified (Provider B) and oidc_verified (Buyer) anchors,
# then merge into /tmp/issued_enterprise_anchors.json for Boxer recompute.
# For clean anchors with real fingerprints, set before running:
#   EVIDENCE_FINGERPRINT="sha256:<64 hex>"   # Provider B service account
#   ASSERTION_FINGERPRINT="sha256:<64 hex>"  # Buyer OIDC
# Prereqs: Registry running (e.g. PORT=3100 pnpm -C packages/registry dev), .env.registry or REGISTRY_* set.

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Issuing service_account_verified (Provider B) ==="
"$REPO_ROOT/scripts/issue_demo_service_account.sh"

echo ""
echo "=== Issuing oidc_verified (Buyer) ==="
"$REPO_ROOT/scripts/issue_demo_oidc.sh"

# Merge anchors: service_account + oidc into one Boxer-compatible file
echo ""
echo "=== Merging into /tmp/issued_enterprise_anchors.json ==="
node -e "
const fs = require('fs');
const sa = JSON.parse(fs.readFileSync('/tmp/issued_service_account_anchor.json', 'utf8'));
const oidc = JSON.parse(fs.readFileSync('/tmp/issued_oidc_anchor.json', 'utf8'));
const allAnchors = [...(sa.anchors || []), ...(oidc.anchors || [])];
const boxerFormat = { anchors: allAnchors };
fs.writeFileSync('/tmp/issued_enterprise_anchors.json', JSON.stringify(boxerFormat, null, 2), 'utf8');
console.log('Wrote /tmp/issued_enterprise_anchors.json (' + allAnchors.length + ' anchors)');
"

echo ""
echo "Done. Recompute snapshot (from repo root):"
echo "  pnpm boxer:recompute --in /tmp/packs_api_only --anchors /tmp/issued_enterprise_anchors.json --out /tmp/passport_api_enterprise.json"
echo ""
echo "Or with a single pack:"
echo "  pnpm boxer:recompute --pack \"\$(pwd)/design_partner_bundle/packs/auditor_pack_api_success.zip\" --anchors /tmp/issued_enterprise_anchors.json --out /tmp/passport_api_enterprise.json"
