#!/usr/bin/env node
/**
 * Release Gate Script
 *
 * Runs the full release gate sequence:
 * 1. Clean .pact directory
 * 2. Build packages
 * 3. Run tests
 * 4. Scan for secrets
 * 5. Check pack
 * 6. Run all examples (skipped if examples/ or basic-happy/run.ts missing)
 * 7. Verify transcripts (skipped if .pact/transcripts missing/no .json or packages/sdk absent)
 *
 * Skips examples when examples/ is absent; skips transcript verification when .pact/transcripts is absent/empty or when packages/sdk is absent. Gate is reusable across repos (e.g. protocol export without SDK or examples).
 * Fails fast on any nonzero exit.
 */

import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync, readdirSync, rmSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

function runCommand(cmd, description) {
  console.log(`\n=== ${description} ===`);
  try {
    execSync(cmd, {
      cwd: repoRoot,
      stdio: "inherit",
    });
    console.log(`✅ ${description} passed\n`);
  } catch (error) {
    console.error(`\n❌ ${description} failed`);
    process.exit(1);
  }
}

console.log("🚀 Starting Release Gate\n");

// Step 1: Clean .pact directory
const pactDir = join(repoRoot, ".pact");
if (existsSync(pactDir)) {
  console.log("🧹 Cleaning .pact directory...");
  rmSync(pactDir, { recursive: true, force: true });
  console.log("✅ .pact directory cleaned\n");
} else {
  console.log("ℹ️  .pact directory does not exist, skipping cleanup\n");
}

// Step 2: Build
runCommand("pnpm build", "Build");

// Step 3: Test
runCommand("pnpm test", "Tests");

// Step 4: Secret scan
runCommand("pnpm secret:scan", "Secret Scan");

// Step 5: Pack check
runCommand("pnpm pack:check", "Pack Check");

// Step 6: Run all examples (skip if examples/ or canonical entry point missing)
const examplesDir = join(repoRoot, "examples");
const examplesEntry = join(examplesDir, "basic-happy", "run.ts");
if (existsSync(examplesDir) && existsSync(examplesEntry)) {
  runCommand("pnpm examples:all", "Examples");
} else {
  console.log("\n=== Examples ===\nℹ️  examples/ missing or incomplete (e.g. basic-happy/run.ts), skipping\n");
}

// Step 7: Verify transcripts (strict + terminal-only); skip if no transcripts or no SDK
const transcriptsDir = join(repoRoot, ".pact", "transcripts");
const sdkDir = join(repoRoot, "packages", "sdk");
const hasTranscripts =
  existsSync(transcriptsDir) &&
  readdirSync(transcriptsDir).some((f) => f.endsWith(".json"));
const hasSdk = existsSync(sdkDir);
if (hasTranscripts && hasSdk) {
  runCommand(
    "node packages/verifier/dist/cli/replay_verify.js --strict --terminal-only -- .pact/transcripts",
    "Transcript Verification"
  );
} else {
  const reason = !hasSdk
    ? "packages/sdk absent (e.g. protocol export)"
    : ".pact/transcripts missing or no .json files";
  console.log("\n=== Transcript Verification ===\nℹ️  " + reason + ", skipping\n");
}

console.log("\n✅ Release Gate: All checks passed!");
process.exit(0);



