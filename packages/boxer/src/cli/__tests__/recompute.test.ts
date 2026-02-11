/**
 * Boxer recompute: art pack + anchors → snapshot with domain_ids and anchor badges.
 * API pack + anchors → snapshot with Provider B KYB badge and api domain_ids.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const REPO_ROOT = resolve(__dirname, "../../../../..");
const ART_PACK = resolve(REPO_ROOT, "design_partner_bundle/packs/auditor_pack_art_success.zip");
const ART_ANCHORS = resolve(REPO_ROOT, "fixtures/anchors/art_anchors.json");
const API_PACK = resolve(REPO_ROOT, "design_partner_bundle/packs/auditor_pack_api_success.zip");
const API_ANCHORS = resolve(REPO_ROOT, "fixtures/anchors/api_anchors.json");
const OUT_ART = resolve(REPO_ROOT, "packages/boxer/.tmp-recompute-test/snapshot_art.json");
const OUT_API = resolve(REPO_ROOT, "packages/boxer/.tmp-recompute-test/snapshot_api.json");

describe("Boxer recompute", () => {
  beforeAll(() => {
    if (!existsSync(resolve(REPO_ROOT, "packages/boxer/dist/cli/recompute.js"))) {
      execSync("pnpm run build", { cwd: resolve(REPO_ROOT, "packages/boxer"), stdio: "pipe" });
    }
  });

  it("produces snapshot with art domain_ids and anchor badges when run on art pack + anchors", () => {
    if (!existsSync(ART_PACK) || !existsSync(ART_ANCHORS)) {
      console.warn("Skip: art pack or anchors not found");
      return;
    }
    execSync(
      `node dist/cli/recompute.js --pack "${ART_PACK}" --anchors "${ART_ANCHORS}" --out "${OUT_ART}"`,
      { cwd: resolve(REPO_ROOT, "packages/boxer"), stdio: "pipe" }
    );
    expect(existsSync(OUT_ART)).toBe(true);
    const snapshot = JSON.parse(readFileSync(OUT_ART, "utf8"));
    expect(snapshot.version).toBe("pact-passport-snapshot/0.0");
    expect(Array.isArray(snapshot.entities)).toBe(true);
    const withAnchors = snapshot.entities.filter((e: { anchors?: unknown[] }) => (e.anchors?.length ?? 0) > 0);
    expect(withAnchors.length).toBeGreaterThanOrEqual(1);
    const domainIds = new Set<string>();
    for (const e of snapshot.entities) {
      for (const d of e.domains ?? []) {
        if (d.domain_id) domainIds.add(d.domain_id);
      }
    }
    expect(domainIds.has("art:authenticity")).toBe(true);
    expect(domainIds.has("art:provenance")).toBe(true);
  });

  it("produces snapshot with Provider B KYB badge and api domain_ids when run on API pack + anchors", () => {
    if (!existsSync(API_PACK) || !existsSync(API_ANCHORS)) {
      console.warn("Skip: API pack or anchors not found");
      return;
    }
    execSync(
      `node dist/cli/recompute.js --pack "${API_PACK}" --anchors "${API_ANCHORS}" --out "${OUT_API}"`,
      { cwd: resolve(REPO_ROOT, "packages/boxer"), stdio: "pipe" }
    );
    expect(existsSync(OUT_API)).toBe(true);
    const snapshot = JSON.parse(readFileSync(OUT_API, "utf8"));
    expect(snapshot.version).toBe("pact-passport-snapshot/0.0");
    const providerB = snapshot.entities.find(
      (e: { signer_public_key_b58?: string }) => e.signer_public_key_b58 === "CACXbtJrzCQqTJ3Ms5EYjgmd4xccVm6uADUYLHZuMYLx"
    );
    expect(providerB).toBeDefined();
    const kybBadge = (providerB?.anchors ?? []).find((a: { type?: string }) => a.type === "kyb_verified");
    expect(kybBadge).toBeDefined();
    const domainIds = new Set<string>();
    for (const e of snapshot.entities) {
      for (const d of e.domains ?? []) {
        if (d.domain_id) domainIds.add(d.domain_id);
      }
    }
    expect(domainIds.has("api:reliability")).toBe(true);
    expect(domainIds.has("api:weather")).toBe(true);
  });
});
