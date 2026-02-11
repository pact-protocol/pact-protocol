# Anchors (trust badges)

Anchors map signer public keys to verification types (e.g. KYB, credential, domain). They are consumed by **Boxer** (Pact’s passport-snapshot component) to produce derived trust snapshots; see [docs/BOXER.md](../../docs/BOXER.md).

- **art_anchors.json** – Art Acquisition Pilot v0.4: `kyb_verified` (Gallery), `credential_verified` (Expert A, B), `domain_verified` (Provenance). Keys match `fixtures/art/_art_pubkeys.json`.
- **api_anchors.json** – API Procurement Pilot v0.4: `kyb_verified` and `domain_verified` (Provider B), `oidc_verified` (Buyer). Keys match `fixtures/api/_api_pubkeys.json`.

Used by Boxer recompute to produce passport snapshots with anchor badges:

```bash
# Art
node packages/boxer/dist/cli/recompute.js --pack design_partner_bundle/packs/auditor_pack_art_success.zip --anchors fixtures/anchors/art_anchors.json --out /tmp/passport_art_v0_4.json

# API
node packages/boxer/dist/cli/recompute.js --pack design_partner_bundle/packs/auditor_pack_api_success.zip --anchors fixtures/anchors/api_anchors.json --out /tmp/passport_api_v0_4.json
```
