import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { PactPolicy, PolicyValidationResult } from "./types";

function loadSchemaJson(): unknown {
  const here = dirname(fileURLToPath(import.meta.url));
  
  // Always try schema.json relative to current file first
  // This works when in source (src/policy/schema.json) 
  // and when bundled (schema would be copied to same location)
  const pathsToTry: string[] = [
    join(here, "schema.json"),
  ];
  
  // Determine if we're in source or dist
  const isInSource = here.includes('/src/policy') || here.includes('\\src\\policy');
  const isInDist = here.endsWith('/dist') || here.endsWith('\\dist') || 
                   here.includes('/dist/policy') || here.includes('\\dist\\policy');
  
  if (isInSource) {
    // If in source, also try dist/ (for built/runtime scenarios)
    // Go up from src/policy/ to package root, then to dist/
    const packageRoot = here.replace(/[/\\]src[/\\]policy.*$/i, '');
    pathsToTry.push(join(packageRoot, "dist", "schema.json"));
  } else if (isInDist) {
    // If in dist, also try source (for development)
    // Go up from dist/ to package root, then to src/policy/
    const packageRoot = here.replace(/[/\\]dist.*$/i, '');
    pathsToTry.push(join(packageRoot, "src", "policy", "schema.json"));
  }
  
  // Try each path in order
  for (const schemaPath of pathsToTry) {
    if (existsSync(schemaPath)) {
      const content = readFileSync(schemaPath, "utf-8");
      return JSON.parse(content);
    }
  }
  
  const allPaths = pathsToTry.join('\n  - ');
  throw new Error(
    `Schema file not found. Tried:\n` +
    `  - ${allPaths}\n` +
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
