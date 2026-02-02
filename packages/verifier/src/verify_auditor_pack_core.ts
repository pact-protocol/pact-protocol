/**
 * Pure auditor pack verification (no Node deps).
 * Same logic as pact-verifier auditor-pack-verify; accepts zip bytes and injectable sha256 + constitution.
 * Used by CLI (Node sha256) and evidence-viewer (WebCrypto).
 */

import JSZip from "jszip";
import type { TranscriptV4 } from "./util/transcript_types.js";
import { stableCanonicalize } from "./util/canonical_pure.js";
import { renderGCView } from "./gc_view/renderer.js";
import { resolveBlameV1 } from "./dbl/blame_resolver_v1.js";
import { stripNondeterministic, generateInsurerSummary } from "./auditor_pack_verify_shared.js";
import { isAcceptedConstitutionHash, getAcceptedConstitutionHashes } from "./util/constitution_hashes.js";

const PACKAGE_VERSION = "auditor_pack_verify/1.0";
const VERIFIER_VERSION = "0.2.1";

const REQUIRED_FILES = [
  "checksums.sha256",
  "manifest.json",
  "input/transcript.json",
  "derived/gc_view.json",
  "derived/judgment.json",
  "derived/insurer_summary.json",
  "constitution/CONSTITUTION_v1.md",
];

export interface VerifyReport {
  version: string;
  ok: boolean;
  checksums_ok: boolean;
  recompute_ok: boolean;
  mismatches: string[];
  tool_version: string;
}

export interface VerifyAuditorPackOptions {
  /** Async SHA-256 (string or Uint8Array -> hex). Required for browser/runtime-agnostic. */
  sha256Async: (data: string | Uint8Array) => Promise<string>;
  /** Standard constitution content (canonicalized in-core). Required for recompute. */
  standardConstitutionContent: string;
  allowNonstandard?: boolean;
}

function canonicalizeConstitution(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n");
}

/**
 * Verify an auditor pack from raw zip bytes.
 * Produces the same auditor_pack_verify/1.0 result as the CLI.
 */
export async function verifyAuditorPackFromBytes(
  zipBytes: Uint8Array,
  options: VerifyAuditorPackOptions
): Promise<VerifyReport> {
  const report: VerifyReport = {
    version: PACKAGE_VERSION,
    ok: false,
    checksums_ok: false,
    recompute_ok: false,
    mismatches: [],
    tool_version: `@pact/verifier ${VERIFIER_VERSION}`,
  };

  const { sha256Async, standardConstitutionContent, allowNonstandard = false } = options;

  try {
    const zip = await JSZip.loadAsync(zipBytes);

    const missingFiles: string[] = [];
    for (const requiredFile of REQUIRED_FILES) {
      if (!zip.file(requiredFile)) missingFiles.push(requiredFile);
    }
    if (missingFiles.length > 0) {
      report.mismatches.push(`Missing required files: ${missingFiles.join(", ")}`);
      return report;
    }

    const checksumsContent = await zip.file("checksums.sha256")!.async("string");
    const checksumLines = checksumsContent.trim().split("\n");
    const checksumMismatches: string[] = [];
    for (const line of checksumLines) {
      const match = line.match(/^([a-f0-9]{64})\s+(.+)$/);
      if (!match) {
        checksumMismatches.push(`Invalid checksum line: ${line}`);
        continue;
      }
      const [, expectedHash, relativePath] = match;
      const file = zip.file(relativePath);
      if (!file) {
        checksumMismatches.push(`File in checksums not found in ZIP: ${relativePath}`);
        continue;
      }
      const fileContent = await file.async("uint8array");
      const actualHash = await sha256Async(fileContent);
      if (actualHash !== expectedHash) {
        checksumMismatches.push(
          `Checksum mismatch for ${relativePath}: expected ${expectedHash.substring(0, 16)}..., got ${actualHash.substring(0, 16)}...`
        );
      }
    }
    report.checksums_ok = checksumMismatches.length === 0;
    if (!report.checksums_ok) report.mismatches.push(...checksumMismatches);

    const manifestContent = await zip.file("manifest.json")!.async("string");
    const manifest = JSON.parse(manifestContent);
    if (!manifest.constitution_version) {
      report.mismatches.push("Missing constitution_version in manifest.json");
      return report;
    }
    if (!manifest.constitution_hash) {
      report.mismatches.push("Missing constitution_hash in manifest.json");
      return report;
    }

    const constitutionFile = zip.file("constitution/CONSTITUTION_v1.md");
    if (!constitutionFile) {
      report.mismatches.push("Missing constitution/CONSTITUTION_v1.md in ZIP");
      return report;
    }
    const packConstitutionContent = await constitutionFile.async("string");
    const canonicalPackConstitution = canonicalizeConstitution(packConstitutionContent);
    const computedConstitutionHash = await sha256Async(canonicalPackConstitution);

    const isConstitutionHashAccepted = isAcceptedConstitutionHash(computedConstitutionHash);
    let constitution_ok = isConstitutionHashAccepted;
    if (!isConstitutionHashAccepted) {
      const acceptedHashes = getAcceptedConstitutionHashes();
      const expectedHash = acceptedHashes[0] || "unknown";
      report.mismatches.push(
        `NON_STANDARD_RULES: constitution hash mismatch (got ${computedConstitutionHash}, expected ${expectedHash})`
      );
      if (!allowNonstandard) {
        return report;
      }
    }

    const transcriptContent = await zip.file("input/transcript.json")!.async("string");
    const transcript: TranscriptV4 = JSON.parse(transcriptContent);

    const sha256AsyncStr: (s: string) => Promise<string> = (s) => sha256Async(s);
    const recomputedGcView = await renderGCView(transcript, {
      constitutionContent: standardConstitutionContent,
      sha256Async: sha256AsyncStr,
    });
    const recomputedJudgment = await resolveBlameV1(transcript, { sha256Async: sha256AsyncStr });

    const recomputeMismatches: string[] = [];
    const manifestConstitutionHash = manifest.constitution_hash;
    const recomputedConstitutionHash = recomputedGcView.constitution.hash;
    if (!allowNonstandard) {
      if (manifestConstitutionHash !== recomputedConstitutionHash) {
        recomputeMismatches.push(
          `Constitution hash mismatch: manifest has ${manifestConstitutionHash.substring(0, 16)}..., recomputed has ${recomputedConstitutionHash.substring(0, 16)}...`
        );
      }
      if (computedConstitutionHash !== recomputedConstitutionHash) {
        recomputeMismatches.push(
          `Constitution hash mismatch: file hash ${computedConstitutionHash.substring(0, 16)}... does not match recomputed hash ${recomputedConstitutionHash.substring(0, 16)}...`
        );
      }
    } else {
      if (manifestConstitutionHash !== computedConstitutionHash) {
        recomputeMismatches.push(
          `Constitution hash mismatch: manifest has ${manifestConstitutionHash.substring(0, 16)}..., file has ${computedConstitutionHash.substring(0, 16)}...`
        );
      }
    }

    const manifestConstitutionVersion = manifest.constitution_version;
    const recomputedConstitutionVersion = recomputedGcView.constitution.version;
    if (manifestConstitutionVersion !== recomputedConstitutionVersion) {
      recomputeMismatches.push(
        `Constitution version mismatch: manifest has ${manifestConstitutionVersion}, recomputed has ${recomputedConstitutionVersion}`
      );
    }

    const originalGcViewContent = await zip.file("derived/gc_view.json")!.async("string");
    let strippedRecomputedGcView = stripNondeterministic(recomputedGcView as unknown as Record<string, unknown>, "gc_view");
    let strippedOriginalGcView = stripNondeterministic(JSON.parse(originalGcViewContent), "gc_view");
    if (allowNonstandard) {
      if (strippedRecomputedGcView.constitution && typeof strippedRecomputedGcView.constitution === "object") {
        const c = { ...(strippedRecomputedGcView.constitution as Record<string, unknown>) };
        delete c.hash;
        strippedRecomputedGcView = { ...strippedRecomputedGcView, constitution: c };
      }
      if (strippedOriginalGcView.constitution && typeof strippedOriginalGcView.constitution === "object") {
        const c = { ...(strippedOriginalGcView.constitution as Record<string, unknown>) };
        delete c.hash;
        strippedOriginalGcView = { ...strippedOriginalGcView, constitution: c };
      }
    }
    const recomputedGcViewCanonical = stableCanonicalize(strippedRecomputedGcView);
    const originalGcViewCanonical = stableCanonicalize(strippedOriginalGcView);
    const recomputedGcViewHash = await sha256Async(recomputedGcViewCanonical);
    const originalGcViewHash = await sha256Async(originalGcViewCanonical);
    if (recomputedGcViewHash !== originalGcViewHash) {
      recomputeMismatches.push(
        `derived/gc_view.json mismatch after canonicalization (recomputed: ${recomputedGcViewHash.substring(0, 16)}..., original: ${originalGcViewHash.substring(0, 16)}...)`
      );
    }

    const originalJudgmentContent = await zip.file("derived/judgment.json")!.async("string");
    const strippedRecomputedJudgment = stripNondeterministic(
      recomputedJudgment as unknown as Record<string, unknown>,
      "judgment"
    );
    const strippedOriginalJudgment = stripNondeterministic(JSON.parse(originalJudgmentContent), "judgment");
    const recomputedJudgmentCanonical = stableCanonicalize(strippedRecomputedJudgment);
    const originalJudgmentCanonical = stableCanonicalize(strippedOriginalJudgment);
    const recomputedJudgmentHash = await sha256Async(recomputedJudgmentCanonical);
    const originalJudgmentHash = await sha256Async(originalJudgmentCanonical);
    if (recomputedJudgmentHash !== originalJudgmentHash) {
      recomputeMismatches.push(
        `derived/judgment.json mismatch after canonicalization (recomputed: ${recomputedJudgmentHash.substring(0, 16)}..., original: ${originalJudgmentHash.substring(0, 16)}...)`
      );
    }

    const recomputedInsurerSummary = await generateInsurerSummary(transcript, recomputedGcView, recomputedJudgment);
    const originalInsurerSummaryContent = await zip.file("derived/insurer_summary.json")!.async("string");
    const strippedRecomputedInsurerSummary = stripNondeterministic(
      recomputedInsurerSummary as unknown as Record<string, unknown>,
      "insurer_summary"
    );
    const strippedOriginalInsurerSummary = stripNondeterministic(JSON.parse(originalInsurerSummaryContent), "insurer_summary");
    const recomputedInsurerSummaryCanonical = stableCanonicalize(strippedRecomputedInsurerSummary);
    const originalInsurerSummaryCanonical = stableCanonicalize(strippedOriginalInsurerSummary);
    const recomputedInsurerSummaryHash = await sha256Async(recomputedInsurerSummaryCanonical);
    const originalInsurerSummaryHash = await sha256Async(originalInsurerSummaryCanonical);
    if (recomputedInsurerSummaryHash !== originalInsurerSummaryHash) {
      recomputeMismatches.push(
        `derived/insurer_summary.json mismatch after canonicalization (recomputed: ${recomputedInsurerSummaryHash.substring(0, 16)}..., original: ${originalInsurerSummaryHash.substring(0, 16)}...)`
      );
    }

    report.recompute_ok = recomputeMismatches.length === 0;
    if (!report.recompute_ok) report.mismatches.push(...recomputeMismatches);

    const constitutionCheckPasses = constitution_ok || allowNonstandard;
    report.ok = report.checksums_ok && report.recompute_ok && constitutionCheckPasses;
    return report;
  } catch (error) {
    report.mismatches.push(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return report;
  }
}
