# Precomputed passport snapshots (derived, not evidence)

**These files are derived artifacts.** They are produced by **Boxer** (Pact’s passport-snapshot component) from auditor packs + anchor fixtures. Boxer does not verify packs; it adds a trust and identity layer (entities, anchor badges, recommendations). These snapshots are not part of the sealed evidence; they drive trust signals and identity badges in the Evidence Viewer. See [docs/BOXER.md](../../docs/BOXER.md) and [packages/boxer/README.md](../../packages/boxer/README.md).

| File | Pack | Use in viewer |
|------|------|----------------|
| `passport_art_enterprise.json` | Art Acquisition (Success) | Expert credentials, subjectivity |
| `passport_api_enterprise.json` | Autonomous API Procurement (Success) | OIDC, KYB, domain badges |
| `passport_api_revoked.json` | Autonomous API Procurement (Success) | Revocation warning (trust degraded, evidence valid) |

**Regenerate (offline):** From repo root:

```bash
./design_partner_bundle/scripts/recompute_snapshots.sh
```

Recompute is deterministic; no registry or network required.
