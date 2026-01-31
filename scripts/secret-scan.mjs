#!/usr/bin/env node
/**
 * Secret Scan Script
 * 
 * Scans git-tracked files for accidental secrets.
 * Respects .gitignore (only scans tracked files).
 * 
 * Patterns scanned:
 * - sk_live_* (Stripe live keys)
 * - rk_live_* (Stripe restricted keys)
 * - xoxb-* (Slack bot tokens)
 * - AIza* (Google API keys)
 * - -----BEGIN (EC|RSA|PRIVATE) KEY----- (Private keys)
 * - mnemonic (mnemonic phrases)
 * - seed phrase (seed phrases)
 * 
 * Exit codes:
 * - 0: No secrets found
 * - 1: Secrets found or error
 */

import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join, relative } from "path";
import { readFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

/**
 * Patterns to scan for (as regex strings).
 * Each pattern should match potential secrets.
 */
const SECRET_PATTERNS = [
  { pattern: /sk_live_[a-zA-Z0-9]{24,}/, name: "Stripe live secret key" },
  { pattern: /rk_live_[a-zA-Z0-9]{24,}/, name: "Stripe restricted key" },
  { pattern: /sk_test_[a-zA-Z0-9]{24,}/, name: "Stripe test secret key" },
  { pattern: /xoxb-[a-zA-Z0-9-]{10,}/, name: "Slack bot token" },
  { pattern: /AIza[0-9A-Za-z_-]{35}/, name: "Google API key" },
  { pattern: /AKIA[0-9A-Z]{16}/, name: "AWS access key ID" },
  { pattern: /-----BEGIN\s+(EC|RSA|PRIVATE)\s+KEY-----/, name: "Private key (PEM)" },
  { pattern: /mnemonic\s*[:=]\s*["']?[a-z\s]{20,}["']?/i, name: "Mnemonic phrase" },
  { pattern: /seed\s+phrase\s*[:=]\s*["']?[a-z\s]{20,}["']?/i, name: "Seed phrase" },
];

/**
 * Paths to allowlist (test vectors, examples with fake keys, etc.).
 * These are paths relative to repo root.
 */
const ALLOWLIST_PATHS = [
  // Test files with test vectors
  /__tests__\/.*\.test\.ts$/,
  /__tests__\/.*\.test\.js$/,
  /\.test\.ts$/,
  /\.test\.js$/,
  /\.spec\.ts$/,
  /\.spec\.js$/,
  // Redaction tests that intentionally contain secrets
  /security\/__tests__\/redact\.test\.ts$/,
  // Stripe live tests that use fake keys
  /settlement\/__tests__\/stripe_live\.test\.ts$/,
  // Documentation examples
  /docs\/.*\.md$/,
  // Scripts that document patterns
  /scripts\/.*\.mjs$/,
];

/**
 * Check if a path should be allowlisted.
 */
function isAllowlisted(filePath) {
  const relPath = relative(repoRoot, filePath);
  return ALLOWLIST_PATHS.some(pattern => pattern.test(relPath));
}

/**
 * Scan a file for secrets.
 * Returns array of matches: [{ line: number, column: number, pattern: string, match: string }]
 */
function scanFile(filePath) {
  const matches = [];
  
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      
      for (const { pattern, name } of SECRET_PATTERNS) {
        const regex = new RegExp(pattern.source, pattern.flags);
        let match;
        
        // Find all matches on this line
        while ((match = regex.exec(line)) !== null) {
          matches.push({
            line: lineNum + 1,
            column: match.index + 1,
            pattern: name,
            match: match[0].substring(0, 50) + (match[0].length > 50 ? "..." : ""), // Truncate for display
          });
          
          // Prevent infinite loop on zero-length matches
          if (match[0].length === 0) {
            regex.lastIndex++;
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error reading ${filePath}: ${error.message}`);
    return matches;
  }
  
  return matches;
}

/**
 * Get list of git-tracked files.
 */
function getTrackedFiles() {
  try {
    const output = execSync("git ls-files", {
      cwd: repoRoot,
      encoding: "utf-8",
    });
    
    return output
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => join(repoRoot, line));
  } catch (error) {
    console.error(`Error getting tracked files: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Main scan function.
 */
function main() {
  console.log("🔍 Scanning for secrets in git-tracked files...\n");
  
  const trackedFiles = getTrackedFiles();
  console.log(`Found ${trackedFiles.length} tracked files\n`);
  
  const allMatches = [];
  
  for (const filePath of trackedFiles) {
    if (isAllowlisted(filePath)) {
      continue; // Skip allowlisted files
    }
    
    const matches = scanFile(filePath);
    
    if (matches.length > 0) {
      const relPath = relative(repoRoot, filePath);
      for (const match of matches) {
        allMatches.push({
          file: relPath,
          ...match,
        });
      }
    }
  }
  
  if (allMatches.length > 0) {
    console.error("❌ Secrets found in tracked files:\n");
    
    // Group by file
    const byFile = {};
    for (const match of allMatches) {
      if (!byFile[match.file]) {
        byFile[match.file] = [];
      }
      byFile[match.file].push(match);
    }
    
    // Print matches
    for (const [file, matches] of Object.entries(byFile)) {
      console.error(`  ${file}:`);
      for (const match of matches) {
        console.error(`    Line ${match.line}, Col ${match.column}: ${match.pattern}`);
        console.error(`    Match: ${match.match}`);
      }
      console.error();
    }
    
    console.error(`\n❌ Found ${allMatches.length} secret(s) in ${Object.keys(byFile).length} file(s)`);
    console.error("\nIf these are test vectors or examples, add the file to ALLOWLIST_PATHS in scripts/secret-scan.mjs");
    process.exit(1);
  }
  
  console.log("✅ No secrets found in tracked files");
  process.exit(0);
}

main();
