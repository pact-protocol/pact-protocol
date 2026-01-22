import { JsonlProviderDirectory } from "@pact/sdk";
import minimist from "minimist";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Find repo root (go up from packages/provider-adapter/src/cli.ts to repo root)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");

const raw = process.argv.slice(2);

// command is first arg
const cmd = raw[0];

// flags are everything after command, BUT strip standalone "--"
const flagArgv = raw.slice(1).filter((x) => x !== "--");

const args = minimist(flagArgv, {
  string: ["registry", "intent", "endpoint", "pubkey", "providerId", "credentials", "region", "baselineLatencyMs"],
  alias: {
    r: "registry",
    i: "intent",
    e: "endpoint",
    p: "pubkey",
    id: "providerId",
    c: "credentials",
    reg: "region",
    l: "baselineLatencyMs",
  },
});

if (cmd === "register") {
  const intentType = args.intent;
  const endpoint = args.endpoint;
  const pubkeyB58 = args.pubkey;
  const providerId = args.providerId || (pubkeyB58 ? pubkeyB58.substring(0, 8) : undefined);
  const credentialsStr = args.credentials;
  const region = args.region;
  const baselineLatencyMsStr = args.baselineLatencyMs;
  // Default to repo root providers.jsonl if no registry specified
  const registryPath = args.registry
    ? path.isAbsolute(args.registry)
      ? args.registry
      : path.resolve(repoRoot, args.registry)
    : path.resolve(repoRoot, "providers.jsonl");

  if (!intentType || !pubkeyB58) {
    console.error("Usage: pact-provider register -- --intent <intentType> --pubkey <pubkey_b58> [options]");
    console.error("\nRequired:");
    console.error("  --intent, -i          Intent type (e.g., weather.data)");
    console.error("  --pubkey, -p         Provider public key (base58)");
    console.error("\nOptional:");
    console.error("  --registry, -r        Registry file path (default: ./providers.jsonl)");
    console.error("  --endpoint, -e        HTTP endpoint URL");
    console.error("  --providerId, --id   Provider ID (default: first 8 chars of pubkey)");
    console.error("  --credentials, -c    Comma-separated credentials (e.g., bonded,sla_verified)");
    console.error("  --region, --reg      Region (e.g., us-east)");
    console.error("  --baselineLatencyMs, -l  Baseline latency in ms");
    process.exit(1);
  }

  // Parse credentials
  const credentials = credentialsStr
    ? credentialsStr.split(",").map((c: string) => c.trim()).filter((c: string) => c !== "")
    : undefined;

  // Parse latency
  const baselineLatencyMs = baselineLatencyMsStr ? parseInt(baselineLatencyMsStr, 10) : undefined;
  if (baselineLatencyMsStr && isNaN(baselineLatencyMs!)) {
    console.error(`Invalid baselineLatencyMs value: ${baselineLatencyMsStr}`);
    process.exit(1);
  }

  // Create directory and register provider
  const directory = new JsonlProviderDirectory({ path: registryPath });

  const record = {
    provider_id: providerId!,
    intentType,
    pubkey_b58: pubkeyB58,
    ...(endpoint && { endpoint }),
    ...(credentials && credentials.length > 0 && { credentials }),
    ...(region && { region }),
    ...(baselineLatencyMs !== undefined && { baseline_latency_ms: baselineLatencyMs }),
  };

  directory.registerProvider(record);

  console.log(`✅ Registered ${providerId} for ${intentType}`);
  console.log(`   Registry: ${registryPath}`);
} else if (cmd === "list") {
  const intentType = args.intent;
  // Default to repo root providers.jsonl if no registry specified
  const registryPath = args.registry
    ? path.isAbsolute(args.registry)
      ? args.registry
      : path.resolve(repoRoot, args.registry)
    : path.resolve(repoRoot, "providers.jsonl");

  if (!intentType) {
    console.error("Usage: pact-provider list -- --intent <intentType> [options]");
    console.error("\nRequired:");
    console.error("  --intent, -i    Intent type (e.g., weather.data)");
    console.error("\nOptional:");
    console.error("  --registry, -r  Registry file path (default: ./providers.jsonl)");
    process.exit(1);
  }

  const directory = new JsonlProviderDirectory({ path: registryPath });
  const providers = directory.listProviders(intentType);

  if (providers.length === 0) {
    console.log(`No providers found for intent: ${intentType}`);
    console.log(`Registry: ${registryPath}`);
    process.exit(0);
  }

  console.log(`\nProviders for ${intentType} (${providers.length}):`);
  console.log("─".repeat(80));
  console.log(
    "ID".padEnd(12) +
    "Pubkey".padEnd(24) +
    "Endpoint".padEnd(30) +
    "Region".padEnd(12) +
    "Credentials"
  );
  console.log("─".repeat(80));

  for (const provider of providers) {
    const id = provider.provider_id.substring(0, 10).padEnd(12);
    const pubkey = provider.pubkey_b58.substring(0, 22).padEnd(24);
    const endpoint = (provider.endpoint || "-").substring(0, 28).padEnd(30);
    const region = (provider.region || "-").padEnd(12);
    const credentials = provider.credentials?.join(",") || "-";
    console.log(`${id}${pubkey}${endpoint}${region}${credentials}`);
  }
  console.log("─".repeat(80));
  console.log(`Registry: ${registryPath}\n`);
} else {
  console.error("Usage: pact-provider <command> [options]");
  console.error("\nCommands:");
  console.error("  register        Register a provider");
  console.error("  list            List providers for an intent type");
  console.error("\nRun 'pact-provider <command> -- --help' for command-specific help");
  process.exit(1);
}

