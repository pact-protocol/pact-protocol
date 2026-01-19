#!/usr/bin/env node
/**
 * H1: Replay Verification CLI
 * 
 * Verifies transcript files with stronger invariants.
 * 
 * Usage:
 *   pnpm replay:verify -- <path>
 * 
 * Supports:
 *   - Single file: pnpm replay:verify -- transcript.json
 *   - Glob pattern: pnpm replay:verify -- "*.json"
 *   - Directory: pnpm replay:verify -- .pact/transcripts
 */

import * as fs from "fs";
import * as path from "path";
import minimist from "minimist";
import { verifyTranscriptFile } from "../transcript/replay";

function isTerminalStatus(status: unknown): boolean {
  return status === "committed" || status === "failed" || status === "aborted";
}

function isTerminalTranscript(transcript: any): boolean {
  const lifecycle = transcript?.settlement_lifecycle;

  // If lifecycle is missing (older transcripts / non-lifecycle settlements),
  // treat as terminal for the purpose of "strict-reconciled" filtering.
  if (!lifecycle) return true;

  if (isTerminalStatus(lifecycle.status)) return true;

  // Some transcripts may have status "pending" but include a terminal event.
  const events = lifecycle.settlement_events;
  if (Array.isArray(events)) {
    return events.some((e: any) => isTerminalStatus(e?.status));
  }

  return false;
}

/**
 * Recursively find all .json files in a directory.
 */
function findJsonFiles(dir: string): string[] {
  const files: string[] = [];
  
  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        files.push(fullPath);
      }
    }
  }
  
  walk(dir);
  return files;
}

/**
 * Check if a transcript is "historical" (likely to have expired credentials).
 * A transcript is considered historical if:
 * - It's older than the specified days threshold, OR
 * - It's a v1/v2 transcript (not v4)
 */
function isHistoricalTranscript(file: string, transcript: any, historicalDays: number): boolean {
  // Check transcript version - v1/v2 transcripts are historical
  const version = transcript?.transcript_version || transcript?.version;
  if (version && typeof version === "string") {
    if (version.startsWith("1.") || version === "pact-transcript/1.0" || version === "pact-transcript/2.0") {
      return true;
    }
  }
  
  // Check age - transcripts older than the threshold are historical
  const createdAt = transcript?.created_at_ms || transcript?.timestamp_ms;
  if (createdAt && typeof createdAt === "number") {
    const ageMs = Date.now() - createdAt;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays > historicalDays) {
      return true;
    }
  }
  
  // Fallback: check file modification time if transcript metadata is missing
  try {
    const stats = fs.statSync(file);
    const ageMs = Date.now() - stats.mtimeMs;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays > historicalDays) {
      return true;
    }
  } catch {
    // If we can't check file stats, don't filter it
  }
  
  return false;
}

async function main() {
  const raw = process.argv.slice(2).filter((x) => x !== "--");
  const args = minimist(raw, {
    boolean: ["strict", "terminal-only", "reconciled-only", "no-historical"],
    string: ["historical-days"],
  });
  
  // Get positional arguments (paths to verify)
  const paths = args._;
  const strict = args.strict || false;
  const terminalOnly = args["terminal-only"] || false;
  const reconciledOnly = args["reconciled-only"] || false;
  const noHistorical = args["no-historical"] || false;
  const historicalDaysStr = args["historical-days"];
  
  // Parse historical-days (default: 30)
  let historicalDays = 30;
  if (historicalDaysStr) {
    const parsed = parseInt(historicalDaysStr, 10);
    if (isNaN(parsed) || parsed < 0) {
      console.error(`Error: --historical-days must be a non-negative number, got: ${historicalDaysStr}`);
      process.exit(1);
    }
    historicalDays = parsed;
  }
  
  if (paths.length === 0) {
    console.error("Usage: pnpm replay:verify -- <path> [--strict] [--terminal-only] [--reconciled-only] [--no-historical] [--historical-days <days>]");
    console.error("");
    console.error("Arguments:");
    console.error("  <path>                    File or directory containing transcript JSON files");
    console.error("");
    console.error("Options:");
    console.error("  --strict                  Treat pending settlements without resolution as errors (default: warnings)");
    console.error("  --terminal-only           When used with --strict, skip pending transcripts with a warning");
    console.error("  --reconciled-only         Only verify reconciled transcripts (*-reconciled-*.json) and terminal transcripts");
    console.error("  --no-historical           Skip historical transcripts (v1/v2 or older than threshold) to avoid expired credential warnings");
    console.error("  --historical-days <days>  Days threshold for considering transcripts historical (default: 30)");
    console.error("");
    console.error("Examples:");
    console.error("  pnpm replay:verify -- .pact/transcripts");
    console.error("  pnpm replay:verify -- transcript.json");
    console.error("  pnpm replay:verify -- .pact/transcripts --strict");
    console.error("  pnpm replay:verify -- .pact/transcripts --strict --terminal-only");
    console.error("  pnpm replay:verify -- .pact/transcripts --no-historical");
    console.error("  pnpm replay:verify -- .pact/transcripts --no-historical --historical-days 7");
    process.exit(1);
  }
  
  const inputPath = paths[0];
  
  // Resolve files to verify
  let files: string[] = [];
  
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Path does not exist: ${inputPath}`);
    console.error(`Hint: Use an absolute path or a path relative to the current directory.`);
    process.exit(1);
  }
  
  const stat = fs.statSync(inputPath);
  
  if (stat.isDirectory()) {
    // Directory: find all *.json files recursively
    files = findJsonFiles(path.resolve(inputPath));
  } else if (stat.isFile()) {
    // Single file
    if (!inputPath.endsWith(".json")) {
      console.error(`Error: File must be a .json file: ${inputPath}`);
      console.error(`Hint: Transcript files must have .json extension.`);
      process.exit(1);
    }
    files = [path.resolve(inputPath)];
  } else {
    console.error(`Error: Path is not a file or directory: ${inputPath}`);
    process.exit(1);
  }
  
  if (files.length === 0) {
    console.error(`Error: No .json files found in: ${inputPath}`);
    console.error(`Hint: Ensure the directory contains transcript JSON files.`);
    process.exit(1);
  }

  // Optional filtering: exclude historical transcripts (v1/v2 or older than threshold)
  // This avoids noisy "credential expired" warnings for old transcripts.
  if (noHistorical) {
    const filtered: string[] = [];
    let excluded = 0;

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, "utf-8");
        const transcript = JSON.parse(content);
        if (isHistoricalTranscript(file, transcript, historicalDays)) {
          excluded++;
        } else {
          filtered.push(file);
        }
      } catch {
        // If unreadable/unparseable, keep it so verification reports a real error.
        filtered.push(file);
      }
    }

    files = filtered;
    if (files.length === 0) {
      console.error(`Error: No non-historical transcripts found in: ${inputPath}`);
      console.error(`Hint: All transcripts appear to be historical (v1/v2 or older than ${historicalDays} days).`);
      console.error(`Hint: Use without --no-historical to verify all transcripts, or adjust --historical-days threshold.`);
      process.exit(1);
    }

    if (excluded > 0) {
      console.log(`ℹ️  Filtered out ${excluded} historical transcript(s) due to --no-historical (v1/v2 or older than ${historicalDays} days)`);
    }
  }

  // Optional filtering: only verify reconciled transcripts and terminal transcripts.
  // This enables "strict with no skips" in folders that include pending snapshots.
  if (reconciledOnly) {
    const filtered: string[] = [];
    let excluded = 0;

    for (const file of files) {
      const base = path.basename(file);
      if (base.includes("-reconciled-")) {
        filtered.push(file);
        continue;
      }

      // Keep terminal transcripts (including older transcripts without lifecycle metadata).
      try {
        const content = fs.readFileSync(file, "utf-8");
        const transcript = JSON.parse(content);
        if (isTerminalTranscript(transcript)) {
          filtered.push(file);
        } else {
          excluded++;
        }
      } catch {
        // If unreadable/unparseable, keep it so verification reports a real error.
        filtered.push(file);
      }
    }

    files = filtered;
    if (files.length === 0) {
      console.error(`Error: No reconciled or terminal transcripts found in: ${inputPath}`);
      console.error(`Hint: Use --reconciled-only only with directories containing reconciled transcripts (*-reconciled-*.json) or terminal transcripts.`);
      process.exit(1);
    }

    if (excluded > 0) {
      console.log(`ℹ️  Filtered out ${excluded} non-terminal (pending) transcript(s) due to --reconciled-only`);
    }
  }
  
  // Verify each file
  let totalErrors = 0;
  let totalWarnings = 0;
  let totalFiles = 0;
  let skippedFiles = 0;
  
  for (const file of files) {
    totalFiles++;
    const result = await verifyTranscriptFile(file, strict, terminalOnly);
    
    // Handle skipped files (strict + terminal-only + pending)
    if (result.skipped) {
      skippedFiles++;
      console.log(`\n${file}:`);
      console.log(`  ⚠️  WARNING: Skipped pending transcript (strict + terminal-only mode)`);
      continue;
    }
    
    if (result.errors.length > 0 || result.warnings.length > 0) {
      console.log(`\n${file}:`);
      
      if (result.warnings.length > 0) {
        totalWarnings += result.warnings.length;
        for (const warning of result.warnings) {
          console.log(`  ⚠️  WARNING: ${warning}`);
        }
      }
      
      if (result.errors.length > 0) {
        totalErrors += result.errors.length;
        for (const error of result.errors) {
          console.log(`  ❌ ERROR: ${error}`);
        }
      }
    }
  }
  
  // Summary
  console.log(`\n=== Summary ===`);
  console.log(`Files verified: ${totalFiles - skippedFiles}`);
  if (skippedFiles > 0) {
    console.log(`Files skipped: ${skippedFiles}`);
  }
  console.log(`Total errors: ${totalErrors}`);
  console.log(`Total warnings: ${totalWarnings}`);
  
  if (totalErrors > 0) {
    console.log(`\n❌ Verification failed with ${totalErrors} error(s)`);
    process.exit(1);
  } else {
    console.log(`\n✅ All transcripts verified successfully`);
    process.exit(0);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

