# Evidence Viewer (Don)

Official instructions for using the Evidence Viewer with the Design Partner Kit.

- **Evidence Viewer implementation:** [apps/evidence-viewer](../../apps/evidence-viewer) (v0.1.x)
- **Canonical packs:** [design_partner_bundle/packs](../../design_partner_bundle/packs)

This folder tracks Don-level documentation and release expectations only. Don does not change how evidence is produced or verified.

## Quickstart

From repo root:

```bash
pnpm install
pnpm --filter @pact/evidence-viewer dev
```

Then drag-and-drop a pack zip from `design_partner_bundle/packs` into the viewer (e.g. `auditor_pack_success.zip`).

Optional: run kit verification first: `./don/design_partner_kit/verify_all.sh`.

**If you see "vite: command not found"** — run `pnpm install` from repo root (workspace install).

## What you should see

- **Verdict header** — VALID, TAMPERED, or INDETERMINATE
- **Round timeline** — Negotiation and settlement rounds
- **DBL judgment** — Blame attribution and confidence
- **Constitution status** — Rules-of-evidence compliance
- **Passport snapshot** — Agent reputation/credit (if present in the pack)
