#!/usr/bin/env tsx
/**
 * Example: Solana Wallet Signing
 * 
 * Demonstrates using SolanaWalletAdapter with acquire().
 * Shows wallet creation, message signing, and transcript recording with capabilities.
 * 
 * This example does NOT send transactions - signing only.
 */

import {
  acquire,
  SolanaWalletAdapter,
  createDefaultPolicy,
  validatePolicyJson,
  generateKeyPair,
  MockSettlementProvider,
  ReceiptStore,
  InMemoryProviderDirectory,
} from "@pact/sdk";
import nacl from "tweetnacl";
import bs58 from "bs58";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

async function main() {
  console.log("=== PACT Example: Solana Wallet Signing ===\n");

  // Generate keypairs
  const buyerKeyPair = generateKeyPair();
  const sellerKeyPair = generateKeyPair();
  const buyerId = bs58.encode(Buffer.from(buyerKeyPair.publicKey));
  const sellerId = bs58.encode(Buffer.from(sellerKeyPair.publicKey));

  // Create Solana wallet adapter with a deterministic seed for testing
  // WARNING: This is a development seed - never use in production!
  const devSeed = new Uint8Array([
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31
  ]);
  const wallet = new SolanaWalletAdapter({ secretKey: devSeed });

  // Get wallet address and capabilities
  const addressInfo = await wallet.getAddress();
  const capabilities = wallet.getCapabilities();
  console.log(`Wallet Chain: ${addressInfo.chain}`);
  console.log(`Wallet Address: ${addressInfo.value}`);
  console.log(`Capabilities:`, JSON.stringify(capabilities, null, 2));
  console.log();

  // Sign a test message
  const testMessage = new TextEncoder().encode("Hello, PACT!");
  const signature = await wallet.signMessage(testMessage);
  console.log(`Signed message "Hello, PACT!"`);
  console.log(`Signature (hex): 0x${Array.from(signature)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")}`);
  console.log(`Signature length: ${signature.length} bytes (ed25519)\n`);

  // Create in-memory provider directory and register a provider
  const directory = new InMemoryProviderDirectory();
  directory.registerProvider({
    provider_id: sellerId,
    intentType: "weather.data",
    pubkey_b58: sellerId,
    region: "us-east",
    credentials: ["sla_verified"],
    baseline_latency_ms: 50,
  });

  // Create settlement provider
  const settlement = new MockSettlementProvider();
  settlement.credit(buyerId, 1.0);
  settlement.credit(sellerId, 0.1);

  // Create receipt store
  const store = new ReceiptStore();

  // Create and validate policy
  const policy = createDefaultPolicy();
  const validated = validatePolicyJson(policy);
  if (!validated.ok) {
    console.error("❌ Policy validation failed:", validated.errors);
    process.exit(1);
  }

  // Run acquisition with Solana wallet injected
  console.log("Running acquisition with Solana wallet...\n");
  const nowFn = () => Date.now();
  const result = await acquire({
    input: {
      intentType: "weather.data",
      scope: "NYC",
      constraints: { latency_ms: 50, freshness_sec: 10 },
      maxPrice: 0.0001,
      saveTranscript: true,
      transcriptDir: path.join(repoRoot, ".pact", "transcripts"),
      wallet: {
        provider: "solana-keypair",
        params: {
          secretKey: devSeed,
        },
      },
    },
    buyerKeyPair: buyerKeyPair,
    sellerKeyPair: sellerKeyPair,
    buyerId: buyerId,
    sellerId: sellerId,
    policy: validated.policy,
    settlement,
    store,
    directory,
    sellerKeyPairsByPubkeyB58: {
      [sellerId]: sellerKeyPair,
    },
    now: nowFn,
  });

  // Print results
  if (result.ok && result.receipt) {
    console.log("✅ Acquisition successful!\n");

    // Print wallet info
    console.log(`Wallet Chain: ${addressInfo.chain}`);
    console.log(`Wallet Address: ${addressInfo.value}`);
    console.log(`Capabilities:`, JSON.stringify(capabilities, null, 2));

    // Print receipt
    console.log("\nReceipt:");
    console.log(JSON.stringify(result.receipt, null, 2));

    // Print transcript path
    if (result.transcriptPath) {
      console.log(`\n📄 Transcript: ${result.transcriptPath}`);
      
      // Show wallet metadata from transcript
      const fs = await import("fs");
      const transcript = JSON.parse(fs.readFileSync(result.transcriptPath, "utf-8"));
      if (transcript.wallet) {
        console.log("\nWallet metadata in transcript:");
        console.log(JSON.stringify(transcript.wallet, null, 2));
      }
    }

    // Show balances
    const buyerBalance = settlement.getBalance(buyerId);
    const sellerBalance = settlement.getBalance(sellerId);
    console.log(`\n💰 Balances:`);
    console.log(`  Buyer:  ${buyerBalance.toFixed(8)}`);
    console.log(`  Seller: ${sellerBalance.toFixed(8)}`);

    console.log("\n=== Example Complete ===");
    process.exit(0);
  } else {
    console.error("\n❌ Acquisition failed!");
    console.error(`Code: ${result.code}`);
    console.error(`Reason: ${result.reason}`);
    
    if (result.transcriptPath) {
      console.error(`\n📄 Transcript: ${result.transcriptPath}`);
    }
    
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});

