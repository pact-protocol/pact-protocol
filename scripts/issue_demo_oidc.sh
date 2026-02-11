#!/usr/bin/env bash
# Issue an oidc_verified anchor for the API Procurement buyer.
# Extracts buyer pubkey from design_partner_bundle/packs/auditor_pack_api_success.zip (INTENT signer).
# Fingerprint: use your real assertion fingerprint (sha256 of id_token/assertion) for clean anchors:
#   ASSERTION_FINGERPRINT="sha256:<64 hex chars>" ./scripts/issue_demo_oidc.sh
# Omit ASSERTION_FINGERPRINT to use a deterministic demo fingerprint (oidc:id_token:demo:buyer).
# Writes /tmp/issued_oidc_anchor.json in Boxer anchors format.
# Prereqs: Registry running (e.g. PORT=3100 pnpm -C packages/registry dev), .env.registry or REGISTRY_* set.

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PACK_ZIP="${PACK_ZIP:-$REPO_ROOT/design_partner_bundle/packs/auditor_pack_api_success.zip}"
REGISTRY_URL="${REGISTRY_URL:-http://localhost:3100}"
API_KEY="${REGISTRY_API_KEY:-dev-api-key}"

if [ ! -f "$PACK_ZIP" ]; then
  echo "Pack not found: $PACK_ZIP" >&2
  exit 1
fi

# Extract INTENT round signer (buyer) from transcript
BUYER_PUBKEY=$(unzip -p "$PACK_ZIP" input/transcript.json 2>/dev/null | node -e "
const chunks = [];
process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  const d = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const intent = (d.rounds || []).find(r => (r.round_type || '').toUpperCase() === 'INTENT');
  const pk = intent?.public_key_b58 || intent?.signature?.signer_public_key_b58;
  console.log(pk || '');
});
" 2>/dev/null)

if [ -z "$BUYER_PUBKEY" ]; then
  echo "Could not extract INTENT signer (buyer) from $PACK_ZIP" >&2
  exit 1
fi

# Use real fingerprint if provided; otherwise deterministic demo fingerprint
if [ -n "$ASSERTION_FINGERPRINT" ]; then
  echo "Using ASSERTION_FINGERPRINT from environment (real fingerprint)."
else
  ASSERTION_FINGERPRINT=$(node -e "const c=require('crypto');console.log('sha256:'+c.createHash('sha256').update('oidc:id_token:demo:buyer').digest('hex'));")
  echo "Using demo assertion_fingerprint. For real anchors set: ASSERTION_FINGERPRINT=\"sha256:<64 hex>\""
fi

ISSUED_JSON="/tmp/issued_oidc_anchor.json"
PAYLOAD_JSON=$(node -e "
console.log(JSON.stringify({
  issuer: 'https://acme.okta.com',
  subject: 'buyer-demo',
  audience: 'pact-registry',
  tenant: 'acme',
  assertion_fingerprint: process.env.FP,
  email: 'buyer@acme.com',
  scope: ['procurement', 'settlement']
}));
" FP="$ASSERTION_FINGERPRINT")

BODY=$(node -e "
console.log(JSON.stringify({
  subject_signer_public_key_b58: '$BUYER_PUBKEY',
  anchor_type: 'oidc_verified',
  verification_method: 'oidc',
  payload: JSON.parse(process.env.PAYLOAD),
  display_name: 'Buyer (OIDC)',
  evidence_refs: ['oidc:id_token:demo:buyer']
}));
" PAYLOAD="$PAYLOAD_JSON")

echo "Issuing oidc_verified anchor for buyer $BUYER_PUBKEY..."
RESP=$(curl -s -w "\n%{http_code}" -X POST "$REGISTRY_URL/v1/anchors/issue" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d "$BODY")
HTTP_BODY=$(echo "$RESP" | head -n -1)
HTTP_CODE=$(echo "$RESP" | tail -n 1)

if [ "$HTTP_CODE" != "201" ]; then
  echo "Registry returned $HTTP_CODE: $HTTP_BODY" >&2
  exit 1
fi

# Write Boxer-compatible anchors format
ATT=$(node -e "
const r = JSON.parse(process.env.BODY);
const a = r.anchor_attestation;
if (!a) process.exit(1);
console.log(JSON.stringify({
  anchors: [{
    subject_signer_public_key_b58: a.subject_signer_public_key_b58,
    signer_public_key_b58: a.subject_signer_public_key_b58,
    anchor_type: a.anchor_type,
    display_name: a.display_name,
    verification_method: a.verification_method,
    payload: a.payload,
    issued_at_ms: a.issued_at_ms,
    issuer: a.issuer_public_key_b58,
    anchor_id: a.anchor_id
  }]
}));
" BODY="$HTTP_BODY")
echo "$ATT" > "$ISSUED_JSON"
echo "Wrote $ISSUED_JSON (Boxer anchors format)."
echo "Buyer pubkey: $BUYER_PUBKEY"
echo ""
echo "Recompute snapshot (from repo root):"
echo "  pnpm boxer:recompute --pack \"\$(pwd)/design_partner_bundle/packs/auditor_pack_api_success.zip\" --anchors $ISSUED_JSON --out /tmp/passport_api_with_oidc.json"
