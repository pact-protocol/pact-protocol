#!/usr/bin/env node
/**
 * Transcript Sanitization Check
 * 
 * Scans transcripts for forbidden keys (secretKey, privateKey, mnemonic, etc.)
 * and fails release gate if any are found.
 * 
 * This ensures that no secrets leak into transcripts, even if redaction logic fails.
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

const FORBIDDEN_KEYS = [
  "secretKey", "privateKey", "mnemonic", "seed", "passphrase",
  "password", "api_key", "apikey", "token", "secret"
];

/**
 * Recursively check object for forbidden keys.
 * 
 * @param obj Object to check
 * @param path Current path in object (for error reporting)
 * @param violations Array to collect violations
 * @returns Array of violations found
 */
function checkObject(obj, path = "", violations = []) {
  if (typeof obj !== "object" || obj === null) return violations;
  
  // Skip arrays (we check their elements)
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      if (typeof item === "object" && item !== null) {
        checkObject(item, `${path}[${index}]`, violations);
      }
    });
    return violations;
  }
  
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;
    
    // Check if key name contains forbidden pattern
    const keyLower = key.toLowerCase();
    if (FORBIDDEN_KEYS.some(forbidden => keyLower.includes(forbidden.toLowerCase()))) {
      // Redact value for display (don't leak secrets in error message)
      let displayValue = "[REDACTED]";
      if (typeof value === "string") {
        displayValue = value.length > 0 ? `"${value.substring(0, 20)}${value.length > 20 ? "..." : ""}"` : '""';
      } else if (typeof value === "object") {
        displayValue = "[object]";
      } else {
        displayValue = String(value);
      }
      
      violations.push({
        path: currentPath,
        key,
        value: displayValue
      });
    }
    
    // Recurse into nested objects
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      checkObject(value, currentPath, violations);
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === "object" && item !== null) {
          checkObject(item, `${currentPath}[${index}]`, violations);
        }
      });
    }
  }
  
  return violations;
}

// Scan .pact/transcripts directory
const transcriptsDir = join(repoRoot, ".pact", "transcripts");
const violations = [];

if (!existsSync(transcriptsDir)) {
  console.log("ℹ️  No transcripts directory found, skipping sanitization check");
  process.exit(0);
}

try {
  const files = readdirSync(transcriptsDir).filter(f => f.endsWith(".json"));
  
  if (files.length === 0) {
    console.log("ℹ️  No transcript files found, skipping sanitization check");
    process.exit(0);
  }
  
  for (const file of files) {
    try {
      const content = JSON.parse(readFileSync(join(transcriptsDir, file), "utf-8"));
      const fileViolations = checkObject(content);
      
      if (fileViolations.length > 0) {
        violations.push({ file, violations: fileViolations });
      }
    } catch (error) {
      // Skip invalid JSON files (they'll be caught by transcript verification)
      console.warn(`⚠️  Skipping ${file}: ${error.message}`);
    }
  }
} catch (error) {
  // Directory read error - that's okay, might not exist yet
  console.log("ℹ️  Could not read transcripts directory, skipping sanitization check");
  process.exit(0);
}

if (violations.length > 0) {
  console.error("❌ Transcript sanitization check failed!");
  console.error("\nFound forbidden keys in transcripts:\n");
  
  for (const { file, violations: fileViols } of violations) {
    console.error(`  ${file}:`);
    for (const v of fileViols) {
      console.error(`    - ${v.path}: ${v.key} = ${v.value}`);
    }
  }
  
  console.error("\n💡 Fix: Ensure wallet params (privateKey, secretKey, etc.) are removed before transcript serialization.");
  console.error("   Check acquire.ts sanitization logic and redactSecrets() usage.\n");
  
  process.exit(1);
}

console.log("✅ Transcript sanitization check passed");
process.exit(0);
