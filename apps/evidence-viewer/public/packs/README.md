# Demo Packs (fixtures)

**These are fixtures for the Evidence Viewer demo.** The `.zip` files in this directory are **not committed** to the repo. The canonical source is `design_partner_bundle/packs/` (and `design_partner_bundle/demo/h5-golden/` for tamper).

- **Load Demo Pack** dropdown: fetches `/packs/<filename>`. To enable it, copy packs here (see below).
- **Drag-drop or design_partner_bundle**: you can always load packs from `design_partner_bundle/packs/` by opening that folder and dragging a `.zip` into the viewer.

## Canonical source

| Demo option       | Filename                          | Source |
|-------------------|-----------------------------------|--------|
| Success           | `auditor_pack_success.zip`        | `design_partner_bundle/packs/` |
| Policy Abort 101  | `auditor_pack_101.zip`            | `design_partner_bundle/packs/` |
| Timeout 420       | `auditor_pack_420.zip`            | `design_partner_bundle/packs/` |
| Tamper            | `auditor_pack_semantic_tampered.zip` | `design_partner_bundle/demo/h5-golden/tamper/` |

## Enabling the demo dropdown (optional)

From repo root, copy fixtures so the in-app **Load Demo Pack** dropdown works:

```bash
cp design_partner_bundle/packs/auditor_pack_success.zip apps/evidence-viewer/public/packs/
cp design_partner_bundle/packs/auditor_pack_101.zip apps/evidence-viewer/public/packs/
cp design_partner_bundle/packs/auditor_pack_420.zip apps/evidence-viewer/public/packs/
cp design_partner_bundle/demo/h5-golden/tamper/auditor_pack_semantic_tampered.zip apps/evidence-viewer/public/packs/
```

Optional legacy names for DemoMode: `success.zip`, `policy_abort.zip`, `tamper.zip` — same scenarios if present.
