# Autonomous API Procurement Pilot v0.4 – Fixtures

- **API-001-autonomous-procurement-success.json** – Success path: INTENT (api.procurement, request, budget_max, sla, min_reliability_gate, min_calibration_gate) → ASK (Provider A quote) → ASK (Provider B quote) → ACCEPT (select Provider B, economic terms). Deterministic keys from `scripts/generate-api-fixture.mjs`.

Regenerate:

```bash
node scripts/generate-api-fixture.mjs
```

Then build auditor pack:

```bash
pnpm -C packages/verifier build
node bin/pact-verifier.mjs auditor-pack --transcript fixtures/api/API-001-autonomous-procurement-success.json --out design_partner_bundle/packs/auditor_pack_api_success.zip
```

Copy to viewer:

```bash
cp design_partner_bundle/packs/auditor_pack_api_success.zip apps/evidence-viewer/public/packs/
```
