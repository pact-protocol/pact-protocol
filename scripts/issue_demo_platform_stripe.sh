#!/usr/bin/env bash
# Issue a Stripe platform_verified anchor for the API Procurement provider.
# Extracts provider pubkey from design_partner_bundle/packs/auditor_pack_api_success.zip (ASK signer),
# builds payload with hashed account id fingerprint, POSTs to registry, writes /tmp/issued_stripe_anchor.json.
# Prereqs: Registry running (e.g. PORT=3100 pnpm -C packages/registry start), .env.registry or REGISTRY_* set.

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PACK_ZIP="${PACK_ZIP:-$REPO_ROOT/design_partner_bundle/packs/auditor_pack_api_success.zip}"
REGISTRY_URL="${REGISTRY_URL:-http://localhost:3100}"
API_KEY="${REGISTRY_API_KEY:-dev-api-key}"

if [ ! -f "$PACK_ZIP" ]; then
  echo "Pack not found: $PACK_ZIP" >&2
  exit 1
fi

# Extract ASK round signer (provider) from transcript
PROVIDER_PUBKEY=$(unzip -p "$PACK_ZIP" input/transcript.json 2>/dev/null | node -e "
const chunks = [];
process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  const d = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const ask = (d.rounds || []).find(r => (r.round_type || '').toUpperCase() === 'ASK');
  const pk = ask?.public_key_b58 || ask?.signature?.signer_public_key_b58;
  console.log(pk || '');
});
" 2>/dev/null)

if [ -z "$PROVIDER_PUBKEY" ]; then
  echo "Could not extract ASK signer (provider) from $PACK_ZIP" >&2
  exit 1
fi

# Deterministic demo account id fingerprint (sha256 of fake id, never use raw acct_/cus_ in payload)
ACCOUNT_ID_FINGERPRINT=$(node -e "const c=require('crypto');console.log('sha256:'+c.createHash('sha256').update('acct_demo_provider_b').digest('hex'));")

# Optional: load registry keys from .env.registry for display (script uses API only; issuance is server-side)
ISSUED_JSON="/tmp/issued_stripe_anchor.json"
PAYLOAD_JSON=$(node -e "
console.log(JSON.stringify({
  platform: 'stripe',
  account_type: 'merchant',
  account_id_fingerprint: process.env.FP,
  scope: ['payments', 'refunds'],
  region: 'US',
  linked_at_ms: Date.now()
}));
" FP="$ACCOUNT_ID_FINGERPRINT")

BODY=$(node -e "
console.log(JSON.stringify({
  subject_signer_public_key_b58: '$PROVIDER_PUBKEY',
  anchor_type: 'platform_verified',
  verification_method: 'stripe',
  payload: JSON.parse(process.env.PAYLOAD),
  display_name: 'Acme Data LLC (Stripe)'
}));
" PAYLOAD="$PAYLOAD_JSON")

echo "Issuing platform_verified (stripe) anchor for provider $PROVIDER_PUBKEY..."
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
echo "Provider pubkey: $PROVIDER_PUBKEY"
echo ""
echo "Recompute snapshot (from repo root):"
echo "  pnpm boxer:recompute --pack \"\$(pwd)/design_partner_bundle/packs/auditor_pack_api_success.zip\" --anchors $ISSUED_JSON --out /tmp/passport_api_with_stripe.json"
