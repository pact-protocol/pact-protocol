# Art Acquisition Pilot v0.4 – Fixtures

- **ART-001-art-acquisition-success.json** – Success path: INTENT (buyer) → ASK (gallery: imaging_v1, provenance) → ASK (expert_a: expert_opinion) → ASK (expert_b: expert_opinion) → ASK (imaging_v2: rerun) → ACCEPT (economic terms). Expert A and Expert B are real signers (deterministic keys in `_art_pubkeys.json`); credential anchors in `fixtures/anchors/art_anchors.json` attach to these pubkeys for Viewer/Boxer.

Regenerate:

```bash
node scripts/generate-art-fixture.mjs
```

Then build auditor pack:

```bash
pnpm -C packages/verifier build
node bin/pact-verifier.mjs auditor-pack --transcript fixtures/art/ART-001-art-acquisition-success.json --out design_partner_bundle/packs/auditor_pack_art_success.zip
```
