# Demo Packs (fixtures)

**These are fixtures for the Evidence Viewer demo.** The viewer demo dropdown loads **only** from this directory (`apps/evidence-viewer/public/packs/`). The canonical source is `design_partner_bundle/packs/` (and `design_partner_bundle/demo/h5-golden/tamper/` for the tamper pack).

- **Sync:** Run `./design_partner_bundle/verify_all.sh` from repo root; it runs `design_partner_bundle/scripts/sync_viewer_packs.sh` to copy all canonical packs here. No manual copy needed for the standard demo.
- **Drag-drop:** You can also load packs by dragging a `.zip` from `design_partner_bundle/packs/` into the viewer.

## Canonical source

| Demo option       | Filename                          | Source |
|-------------------|-----------------------------------|--------|
| Success           | `auditor_pack_success.zip`        | `design_partner_bundle/packs/` |
| Policy Abort 101  | `auditor_pack_101.zip`            | `design_partner_bundle/packs/` |
| Timeout 420       | `auditor_pack_420.zip`            | `design_partner_bundle/packs/` |
| Tamper (derived output altered) | `auditor_pack_semantic_tampered.zip`  | `design_partner_bundle/demo/h5-golden/tamper/` |

## Enabling the demo dropdown (optional)

From repo root, copy fixtures so the in-app **Load Demo Pack** dropdown works:

```bash
cp design_partner_bundle/packs/auditor_pack_success.zip apps/evidence-viewer/public/packs/
cp design_partner_bundle/packs/auditor_pack_101.zip apps/evidence-viewer/public/packs/
cp design_partner_bundle/packs/auditor_pack_420.zip apps/evidence-viewer/public/packs/
cp design_partner_bundle/demo/h5-golden/tamper/auditor_pack_semantic_tampered.zip apps/evidence-viewer/public/packs/
```

The dropdown shows **Tamper (derived output altered)**; the file is `auditor_pack_semantic_tampered.zip`.

Optional legacy filenames in `public/packs/`: `success.zip`, `policy_abort.zip`, `tamper.zip` — same scenarios if present; the dropdown uses the canonical filenames above.

## Expected semantics (after regeneration)

| Demo option      | Status / Outcome                    | Judgment (fault)     | Integrity   |
|------------------|-------------------------------------|----------------------|-------------|
| Success          | COMPLETED                           | NO_FAULT             | VALID       |
| Policy Abort 101 | ABORTED_POLICY                      | BUYER_AT_FAULT       | VALID       |
| Timeout 420      | FAILED_PROVIDER_UNREACHABLE         | PROVIDER_AT_FAULT    | VALID       |
| Tamper           | (tampered content in gc_view)       | —                    | TAMPERED    |

## Regenerating demo packs (when verifier canonicalization changes)

When the verifier's gc_view renderer or canonicalizer changes, demo packs can fail with `derived/gc_view.json mismatch`. Regenerate the non-tamper packs to fix:

```bash
# From repo root. Copy packs first if needed, then regenerate gc_view + checksums.
cp design_partner_bundle/packs/auditor_pack_101.zip design_partner_bundle/packs/auditor_pack_420.zip design_partner_bundle/packs/auditor_pack_success.zip apps/evidence-viewer/public/packs/
pnpm evidence-viewer:regen-packs
```

This rebuilds the verifier, regenerates `derived/gc_view.json` and `checksums.sha256` in 101, 420, and success packs. **Do not regenerate the tamper pack** (`auditor_pack_semantic_tampered.zip`); it must remain failing.

## One-command verification (integrity path)

After copying the packs above, you can verify the new integrity path in two ways.

**A) In the viewer (manual)**  
1. Load **Success** (`auditor_pack_success.zip`). Confirm: Integrity VALID, Status COMPLETED, Judgment NO_FAULT.  
2. Load **Policy Abort 101**. Confirm: Integrity VALID, Status ABORTED_POLICY, Judgment BUYER_AT_FAULT.  
3. Load **Timeout 420**. Confirm: Integrity VALID, Status FAILED_PROVIDER_UNREACHABLE, Judgment PROVIDER_AT_FAULT.  
4. Load **Tamper** (`auditor_pack_semantic_tampered.zip`). Confirm: Integrity TAMPERED, verification subtext "Integrity check failed. Do not trust this pack."

**B) One command (tests)**  
From repo root, with packs in `apps/evidence-viewer/public/packs/`:

```bash
pnpm --filter @pact/evidence-viewer test -- src/lib/__tests__/loadPack.integrity.test.ts
```

Tests are skipped if the pack files are missing.
