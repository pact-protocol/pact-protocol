#!/usr/bin/env node
/**
 * CLI for Passport v1 Query
 * 
 * Queries a passport registry file for a specific signer's passport record.
 * 
 * Usage: pact-verifier passport-v1-query --signer <pubkey> [--registry <file>]
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface PassportRecord {
  version: "passport/1.0";
  signer: string;
  role: "BUYER" | "PROVIDER" | "UNKNOWN";
  score: number;
  tier: "A" | "B" | "C" | "D";
  history: Array<{
    transcript_id: string;
    outcome: string;
    fault_domain: string;
    delta: number;
    confidence: number;
    timestamp: string;
  }>;
  last_updated: string;
  constitution_hash: string;
}

interface PassportRegistry {
  version: "passport/1.0";
  generated_from: {
    transcripts_dir: string;
    count: number;
  };
  records: Record<string, PassportRecord>;
}

function parseArgs(): {
  signer: string;
  registry?: string;
} {
  const args = process.argv.slice(2);
  let signer: string | undefined;
  let registry: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--signer" && i + 1 < args.length) {
      signer = args[i + 1];
      i++;
    } else if (args[i] === "--registry" && i + 1 < args.length) {
      registry = args[i + 1];
      i++;
    } else if (args[i] === "--help" || args[i] === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!signer) {
    console.error("Error: --signer is required");
    printHelp();
    process.exit(1);
  }

  return { signer, registry };
}

function printHelp(): void {
  console.error(`
Usage: passport-v1-query --signer <pubkey> [--registry <file>]

Queries a passport registry file for a specific signer's passport record.

Options:
  --signer <pubkey>     Signer public key (base58) to query (required)
  --registry <file>     Path to registry JSON file (default: ./passport_registry.json)
  --help, -h            Show this help message

Examples:
  # Query default registry
  passport-v1-query --signer 21wxunPRWgrzXqK48yeE1aEZtfpFU2AwY8odDiGgBT4J

  # Query custom registry
  passport-v1-query --signer 21wxunPRWgrzXqK48yeE1aEZtfpFU2AwY8odDiGgBT4J --registry ./my_registry.json
`);
}

function loadRegistry(registryPath?: string): PassportRegistry {
  const defaultPath = resolve(process.cwd(), "passport_registry.json");
  const filePath = registryPath 
    ? (isAbsolute(registryPath) ? registryPath : resolve(process.cwd(), registryPath))
    : defaultPath;

  if (!existsSync(filePath)) {
    console.error(`Error: Registry file not found: ${filePath}`);
    console.error("Run: pact-verifier passport-v1-recompute --transcripts-dir <dir> --out <file>");
    process.exit(1);
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const registry = JSON.parse(content) as PassportRegistry;
    
    if (registry.version !== "passport/1.0") {
      console.error(`Error: Invalid registry version: ${registry.version}`);
      process.exit(1);
    }

    return registry;
  } catch (error) {
    console.error(`Error: Failed to load registry: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Handle EPIPE gracefully
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") {
    process.exit(0);
  }
});

export async function main(): Promise<void> {
  try {
    const { signer, registry } = parseArgs();
    const passportRegistry = loadRegistry(registry);

    // Find the signer's record
    const record = passportRegistry.records[signer];

    if (!record) {
      console.error(`Error: Signer ${signer} not found in registry`);
      console.error(`Registry contains ${Object.keys(passportRegistry.records).length} signers`);
      process.exit(1);
    }

    // Output JSON
    console.log(JSON.stringify(record, null, 2));
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Only run main if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("passport_v1_query.ts")) {
  main().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}
