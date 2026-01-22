#!/usr/bin/env node

import { JsonlProviderDirectory } from "@pact/sdk";
import minimist from "minimist";
import path from "node:path";

// Skip '--' if present (from pnpm script)
const argv = process.argv.slice(2);
const skipDoubleDash = argv[0] === "--" ? argv.slice(1) : argv;

const args = minimist(skipDoubleDash, {
  string: ["intent", "endpoint", "pubkey", "credentials", "region", "latency", "path"],
  alias: {
    i: "intent",
    e: "endpoint",
    p: "pubkey",
    c: "credentials",
    r: "region",
    l: "latency",
    f: "path",
  },
});

const intentType = args.intent;
const endpoint = args.endpoint;
const pubkeyB58 = args.pubkey;
const credentialsStr = args.credentials;
const region = args.region;
const latencyStr = args.latency;
const registryPath = args.path || path.join(process.cwd(), "providers.jsonl");

if (!intentType || !pubkeyB58) {
  console.error("Usage: pnpm provider-adapter:register -- --intent <intentType> --pubkey <pubkey_b58> [options]");
  console.error("\nRequired:");
  console.error("  --intent, -i    Intent type (e.g., weather.data)");
  console.error("  --pubkey, -p    Provider public key (base58)");
  console.error("\nOptional:");
  console.error("  --endpoint, -e      HTTP endpoint URL");
  console.error("  --credentials, -c   Comma-separated credentials (e.g., bonded,sla_verified)");
  console.error("  --region, -r       Region (e.g., us-east)");
  console.error("  --latency, -l       Baseline latency in ms");
  console.error("  --path, -f          Registry file path (default: ./providers.jsonl)");
  process.exit(1);
}

// Parse credentials
const credentials = credentialsStr
  ? credentialsStr.split(",").map((c) => c.trim()).filter((c) => c !== "")
  : undefined;

// Parse latency
const baselineLatencyMs = latencyStr ? parseInt(latencyStr, 10) : undefined;
if (latencyStr && isNaN(baselineLatencyMs!)) {
  console.error(`Invalid latency value: ${latencyStr}`);
  process.exit(1);
}

// Generate provider_id from pubkey (use first 8 chars)
const providerId = pubkeyB58.substring(0, 8);

// Create directory and register provider
const directory = new JsonlProviderDirectory({ path: registryPath });

const record = {
  provider_id: providerId,
  intentType,
  pubkey_b58: pubkeyB58,
  ...(endpoint && { endpoint }),
  ...(credentials && credentials.length > 0 && { credentials }),
  ...(region && { region }),
  ...(baselineLatencyMs !== undefined && { baseline_latency_ms: baselineLatencyMs }),
};

directory.registerProvider(record);

console.log(`✅ Registered provider: ${providerId}`);
console.log(`   Intent: ${intentType}`);
console.log(`   Pubkey: ${pubkeyB58.substring(0, 20)}...`);
if (endpoint) console.log(`   Endpoint: ${endpoint}`);
if (credentials) console.log(`   Credentials: ${credentials.join(", ")}`);
if (region) console.log(`   Region: ${region}`);
if (baselineLatencyMs) console.log(`   Latency: ${baselineLatencyMs}ms`);
console.log(`   Registry: ${registryPath}`);

