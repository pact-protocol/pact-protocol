#!/usr/bin/env node
/**
 * CLI for Default Blame Logic (DBL) v1
 * 
 * Takes a verified v4 transcript and outputs a deterministic Judgment Artifact.
 * 
 * Usage: pnpm -w tsx packages/verifier/src/cli/judge_v4.ts <transcript.json>
 */

import { resolveBlameV1 } from "../dbl/blame_resolver_v1.js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Repo root is 3 levels up from packages/verifier/src/cli/judge_v4.ts
const repoRoot = resolve(__dirname, "../../../..");

const transcriptPathArg = process.argv[2];

if (!transcriptPathArg) {
  console.error("Usage: judge_v4.ts <transcript.json>");
  process.exit(1);
}

// Resolve path: if absolute, use as-is; if relative and exists in cwd, use as-is;
// otherwise try relative to repo root
let transcriptPath: string;
if (isAbsolute(transcriptPathArg)) {
  transcriptPath = transcriptPathArg;
} else if (existsSync(transcriptPathArg)) {
  // Exists relative to current working directory
  transcriptPath = resolve(process.cwd(), transcriptPathArg);
} else {
  // Try relative to repo root
  transcriptPath = resolve(repoRoot, transcriptPathArg);
  if (!existsSync(transcriptPath)) {
    console.error(`Error: Transcript file not found: ${transcriptPathArg}`);
    console.error(`  Tried: ${resolve(process.cwd(), transcriptPathArg)}`);
    console.error(`  Tried: ${transcriptPath}`);
    process.exit(1);
  }
}

(async () => {
  try {
    // Read transcript file
    const transcriptContent = readFileSync(transcriptPath, "utf-8");
    const transcript = JSON.parse(transcriptContent);

    // Resolve blame (now async)
    const judgment = await resolveBlameV1(transcript);

    // Output JSON
    console.log(JSON.stringify(judgment, null, 2));

    // Output compact human-readable line
    const compactLine = [
      `Status: ${judgment.status}`,
      judgment.failureCode ? `Code: ${judgment.failureCode}` : null,
      `LVSH: Round ${judgment.lastValidRound} (${judgment.lastValidSummary})`,
      `Determination: ${judgment.dblDetermination}`,
      `Passport: ${judgment.passportImpact >= 0 ? '+' : ''}${judgment.passportImpact}`,
      `Confidence: ${(judgment.confidence * 100).toFixed(0)}%`,
      judgment.recommendation ? `→ ${judgment.recommendation}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    console.error(`\n${compactLine}`);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
})();
