# Anchor fixtures (design partner bundle)

Used by `scripts/recompute_snapshots.sh` to produce passport snapshots **offline** (no registry).

| File | Purpose |
|------|---------|
| (use repo `fixtures/anchors/art_anchors.json`) | Art Acquisition pilot — credentialed experts |
| (use repo `fixtures/anchors/api_anchors.json`) | API Procurement pilot — enterprise identity (KYB, OIDC, domain) |
| `api_anchors_revoked.json` | API pilot with one anchor revoked — trust degraded, evidence still valid |

Snapshot outputs go to `design_partner_bundle/fixtures/snapshots/`. Recompute is deterministic; snapshots can be regenerated anytime.
