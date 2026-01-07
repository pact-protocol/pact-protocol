import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { PactPolicy, PolicyValidationResult } from "./types";

function loadSchemaJson(): unknown {
  // When bundled, code runs from dist/index.js (or node_modules/@pact/sdk/dist/index.js when installed)
  // Schema is at dist/schema.json (same directory as index.js)
  const here = dirname(fileURLToPath(import.meta.url)); // dist/ (or node_modules/@pact/sdk/dist/)
  
  // If we're not already in dist/, look for dist/schema.json
  // This handles cases where import.meta.url might point to the package root
  let schemaPath: string;
  if (here.endsWith('/dist') || here.endsWith('\\dist')) {
    // We're already in dist/, schema.json is in the same directory
    schemaPath = join(here, "schema.json");
  } else {
    // We're in the package root, schema.json is in dist/
    schemaPath = join(here, "dist", "schema.json");
  }
  
  // Try the primary path first
  if (existsSync(schemaPath)) {
    const content = readFileSync(schemaPath, "utf-8");
    return JSON.parse(content);
  }
  
  // Fallback: try same directory (in case we're already in dist/)
  const fallbackPath = join(here, "schema.json");
  if (existsSync(fallbackPath)) {
    const content = readFileSync(fallbackPath, "utf-8");
    return JSON.parse(content);
  }
  
  throw new Error(
    `Schema file not found. Tried:\n` +
    `  - ${schemaPath}\n` +
    `  - ${fallbackPath}\n` +
    `import.meta.url: ${import.meta.url}\n` +
    `Resolved directory: ${here}`
  );
}

// Remove $schema field as Ajv doesn't need it for validation
const schemaRaw = loadSchemaJson() as { $schema?: string; [key: string]: unknown };
const { $schema, ...schema } = schemaRaw;

const ajv = new Ajv({ 
  allErrors: true, 
  strict: false,
  validateSchema: false,
});
addFormats(ajv);

const validateSchema = ajv.compile(schema);

export function validatePolicy(policyJson: unknown): PolicyValidationResult {
  const valid = validateSchema(policyJson);
  
  if (!valid) {
    const errors = (validateSchema.errors || []).map((err) => ({
      path: err.instancePath || err.schemaPath || "",
      message: err.message || "Validation error",
    }));
    
    return {
      ok: false,
      errors,
    };
  }
  
  return {
    ok: true,
    policy: policyJson as PactPolicy,
  };
}

// Alias for compatibility
export const validatePolicyJson = validatePolicy;
