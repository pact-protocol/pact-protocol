/**
 * Run to regenerate FROZEN_BASELINE_HASHES. Writes freeze_record_output.json in package root.
 * Usage: from repo root: pnpm exec tsx packages/verifier/scripts/record_freeze_hashes.ts
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import type { TranscriptV4 } from "../src/util/transcript_types.js";
import { renderGCView } from "../src/gc_view/renderer.js";
import { resolveBlameV1 } from "../src/dbl/blame_resolver_v1.js";
import { generateInsurerSummary } from "../src/cli/auditor_pack_verify.js";
import { stableCanonicalize } from "../src/util/canonical.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// scripts -> verifier -> packages -> monorepo root (run from repo root)
const repoRoot = resolve(__dirname, "../../..");

const TRANSCRIPT_FIXTURES: Array<[string, string]> = [
  ["SUCCESS-001-simple", "fixtures/success/SUCCESS-001-simple.json"],
  ["PACT-101-policy-violation", "fixtures/failures/PACT-101-policy-violation.json"],
  ["PACT-420-provider-unreachable", "fixtures/failures/PACT-420-provider-unreachable.json"],
  ["PACT-421-provider-api-mismatch", "fixtures/failures/PACT-421-provider-api-mismatch.json"],
];

function stripAdditivePaths<T extends Record<string, unknown>>(
  obj: T,
  artifactKind: "gc_view" | "insurer_summary" | "judgment"
): T {
  const out = JSON.parse(JSON.stringify(obj)) as T;
  if (artifactKind === "gc_view") {
    delete (out as Record<string, unknown>).audit;
    if (out.policy && typeof out.policy === "object" && out.policy !== null) {
      delete (out.policy as Record<string, unknown>).audit;
    }
  }
  if (artifactKind === "insurer_summary") {
    delete (out as Record<string, unknown>).audit_tier;
    delete (out as Record<string, unknown>).audit_sla;
  }
  return out;
}

function sha256Hex(str: string): string {
  return createHash("sha256").update(str, "utf8").digest("hex");
}

function baselineHash(obj: unknown, artifactKind: "gc_view" | "insurer_summary" | "judgment"): string {
  const stripped =
    typeof obj === "object" && obj !== null && !Array.isArray(obj)
      ? stripAdditivePaths(obj as Record<string, unknown>, artifactKind)
      : obj;
  const canonical = stableCanonicalize(stripped);
  return sha256Hex(canonical);
}

function loadTranscript(path: string): TranscriptV4 {
  const fullPath = resolve(repoRoot, path);
  if (!existsSync(fullPath)) throw new Error(`Fixture not found: ${fullPath}`);
  return JSON.parse(readFileSync(fullPath, "utf-8"));
}

async function main() {
  const hashes: Record<string, { gc_view: string; insurer_summary: string; judgment: string }> = {};
  for (const [key, relPath] of TRANSCRIPT_FIXTURES) {
    try {
      const transcript = loadTranscript(relPath);
      const gcView = await renderGCView(transcript);
      const judgment = await resolveBlameV1(transcript);
      const insurerSummary = await generateInsurerSummary(transcript, gcView, judgment);
      hashes[key] = {
        gc_view: baselineHash(gcView, "gc_view"),
        insurer_summary: baselineHash(insurerSummary, "insurer_summary"),
        judgment: baselineHash(judgment, "judgment"),
      };
    } catch (e) {
      console.error(`Fixture ${key}:`, e);
    }
  }
  const outPath = join(repoRoot, "packages/verifier/freeze_record_output.json");
  writeFileSync(outPath, JSON.stringify(hashes, null, 2), "utf-8");
  console.log("Wrote", outPath);
  console.log(JSON.stringify(hashes, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
