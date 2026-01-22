#!/usr/bin/env node

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

const specSchemaPath = join(repoRoot, "specs/pact-policy/1.0/schema.json");
const sdkSchemaPath = join(repoRoot, "packages/sdk/src/policy/schema.json");

try {
  const specSchema = JSON.parse(readFileSync(specSchemaPath, "utf-8"));
  const sdkSchema = JSON.parse(readFileSync(sdkSchemaPath, "utf-8"));

  // Deep equality check
  const specStr = JSON.stringify(specSchema, null, 2);
  const sdkStr = JSON.stringify(sdkSchema, null, 2);

  if (specStr !== sdkStr) {
    console.error("❌ Schema drift detected!");
    console.error(`   Spec: ${specSchemaPath}`);
    console.error(`   SDK:  ${sdkSchemaPath}`);
    console.error("\n   The SDK schema.json does not match the spec schema.json.");
    console.error("   Please copy specs/pact-policy/1.0/schema.json to packages/sdk/src/policy/schema.json");
    process.exit(1);
  }

  console.log("✅ Spec integrity check passed: schema.json matches");
} catch (error) {
  console.error("❌ Error checking spec integrity:", error.message);
  process.exit(1);
}

