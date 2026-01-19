#!/usr/bin/env tsx
/**
 * PACT v4 Quickstart Demo
 * 
 * One-command demo showing v4 features:
 * - Pact Boundary Runtime (policy enforcement)
 * - v4 Transcripts (hash-linked, replayable)
 * - Policy-as-Code v4 (deterministic evaluation)
 * 
 * Run: pnpm demo:v4:canonical
 */

import { 
  runInPactBoundary, 
  type BoundaryIntent, 
  type PactPolicyV4,
  replayTranscriptV4, 
  addRoundToTranscript,
  stableCanonicalize,
  hashMessage,
} from "@pact/sdk";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import bs58 from "bs58";
import type { TranscriptV4, TranscriptRound, Signature } from "@pact/sdk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

/**
 * Ed25519 keypair with Node.js crypto KeyObjects for signing.
 */
interface KeyPairWithObjects {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  publicKeyObj: crypto.KeyObject;
  privateKeyObj: crypto.KeyObject;
}

/**
 * Generate Ed25519 keypair using Node.js crypto (no external deps needed).
 * Returns keypair in tweetnacl-compatible format for signature verification.
 */
function generateKeyPair(): KeyPairWithObjects {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  
  // Export keys in JWK format to get raw bytes
  const publicKeyJwk = publicKey.export({ format: "jwk" }) as { x: string };
  const privateKeyJwk = privateKey.export({ format: "jwk" }) as { d: string; x: string };
  
  // JWK 'x' is base64url-encoded public key (32 bytes), 'd' is base64url-encoded private key (32 bytes)
  const publicKeyBytes = Buffer.from(publicKeyJwk.x, "base64url");
  const privateKeyBytes = Buffer.from(privateKeyJwk.d, "base64url");
  
  // tweetnacl format: secretKey is 64 bytes (32 private + 32 public)
  return {
    publicKey: new Uint8Array(publicKeyBytes),
    secretKey: new Uint8Array(Buffer.concat([privateKeyBytes, publicKeyBytes])),
    publicKeyObj: publicKey,
    privateKeyObj: privateKey,
  };
}

/**
 * Create a signed round for transcript.
 * Matches fixture generator structure: envelope contains type + intent_id + round-specific fields.
 */
function createSignedRound(
  roundType: "INTENT" | "ASK" | "BID" | "COUNTER" | "ACCEPT" | "REJECT" | "ABORT",
  agentId: string,
  keypair: ReturnType<typeof generateKeyPair>,
  timestampMs: number,
  intentId: string,
  contentSummary?: Record<string, unknown>
): Omit<TranscriptRound, "round_number" | "previous_round_hash" | "round_hash"> {
  // Create envelope object matching fixture generator structure
  // Envelope contains: type, intent_id, and round-specific fields (price, etc.)
  const envelope: Record<string, unknown> = {
    type: roundType,
    intent_id: intentId,
    ...contentSummary,
  };

  // Hash the envelope using stableCanonicalize + sha256 (matches fixture generator)
  const envelopeCanonical = stableCanonicalize(envelope);
  const envelopeHash = crypto.createHash("sha256").update(envelopeCanonical, "utf8").digest("hex");
  
  // Sign the envelope hash using Node.js crypto Ed25519
  const hashBytes = Buffer.from(envelopeHash, "hex");
  const sigBytes = crypto.sign(null, hashBytes, keypair.privateKeyObj);
  const signatureB58 = bs58.encode(sigBytes);
  const publicKeyB58 = bs58.encode(Buffer.from(keypair.publicKey));

  const signature: Signature = {
    signer_public_key_b58: publicKeyB58,
    signature_b58: signatureB58,
    signed_at_ms: timestampMs,
    scheme: "ed25519",
  };

  return {
    round_type: roundType,
    message_hash: envelopeHash, // Same as envelope_hash (matches fixtures)
    envelope_hash: envelopeHash,
    signature,
    timestamp_ms: timestampMs,
    agent_id: agentId,
    public_key_b58: publicKeyB58,
    content_summary: contentSummary || {},
  };
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  PACT v4 Quickstart Demo");
  console.log("  Institution-Grade Autonomous Commerce Infrastructure");
  console.log("═══════════════════════════════════════════════════════════\n");

  // Create intent
  const intent: BoundaryIntent = {
    intent_id: `intent-${Date.now()}`,
    intent_type: "weather.data",
    created_at_ms: Date.now(),
    params: {
      city: "NYC",
      freshness_seconds: 10,
    },
  };

  // Create Policy v4 (max price constraint)
  const policy: PactPolicyV4 = {
    policy_version: "pact-policy/4.0",
    policy_id: "policy-demo-v4",
    rules: [
      {
        name: "max_price",
        condition: {
          field: "offer_price",
          operator: "<=",
          value: 0.05,
        },
      },
    ],
  };

  console.log("📋 Setup:");
  console.log("   ✓ Created intent: weather.data (NYC)");
  console.log("   ✓ Created Policy v4: max_price <= $0.05");
  console.log("   ✓ Initialized Pact Boundary Runtime\n");

  // Ensure transcript directory exists
  const transcriptDir = path.join(repoRoot, ".pact", "transcripts");
  if (!fs.existsSync(transcriptDir)) {
    fs.mkdirSync(transcriptDir, { recursive: true });
  }

  // Run inside Pact Boundary
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  🔄 Negotiation Starting...");
  console.log("═══════════════════════════════════════════════════════════\n");
  console.log("  Intent: weather.data (NYC)");
  console.log("  Max price: $0.05 (enforced by Policy v4)");
  console.log("  Settlement: boundary (in-memory)\n");

  const result = await runInPactBoundary(intent, policy, async (context) => {
    // Simulate negotiation: buyer offers $0.04 (within policy)
    const offerPrice = 0.04;
    
    // Policy is evaluated automatically by Boundary Runtime
    // If offerPrice > 0.05, boundary would abort with PACT-101
    
    return {
      success: true,
      offer_price: offerPrice,
      bid_price: offerPrice,
      settlement_mode: "boundary",
      data: {
        temperature: 72,
        humidity: 65,
        city: "NYC",
      },
    };
  });

  // Add signed rounds to transcript (INTENT, ASK, ACCEPT)
  let transcript = result.transcript;
  
  // Generate keypairs for buyer and seller
  const buyerKeypair = generateKeyPair();
  const sellerKeypair = generateKeyPair();
  
  // Helper to compute initial hash for round 0 (matches replay.ts logic)
  const computeInitialHash = (intentId: string, createdAtMs: number): string => {
    const combined = `${intentId}:${createdAtMs}`;
    return crypto.createHash("sha256").update(combined, "utf8").digest("hex");
  };
  
  // Helper to compute round hash (matches transcript.ts logic - excludes round_hash field)
  const computeRoundHash = (round: Omit<TranscriptRound, "round_hash">): string => {
    const canonical = stableCanonicalize(round);
    return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
  };
  
  const baseTimestamp = intent.created_at_ms;
  const initialHash = computeInitialHash(intent.intent_id, intent.created_at_ms);
  
  // Add INTENT round (round 0) - use addRoundToTranscript but fix previous_round_hash after
  const intentRoundRaw = createSignedRound("INTENT", "buyer", buyerKeypair, baseTimestamp, intent.intent_id, {
    intent_type: intent.intent_type,
  });
  
  // Create round 0 manually with correct previous_round_hash, then compute round_hash
  const intentRoundWithoutHash: Omit<TranscriptRound, "round_hash"> = {
    ...intentRoundRaw,
    round_number: 0,
    previous_round_hash: initialHash,
  };
  const intentRoundHash = computeRoundHash(intentRoundWithoutHash);
  const intentRound: TranscriptRound = {
    ...intentRoundWithoutHash,
    round_hash: intentRoundHash,
  };
  
  // Add round 0 to transcript
  transcript = {
    ...transcript,
    rounds: [intentRound],
  };
  
  // Add ASK round (round 1) - addRoundToTranscript will use round 0's round_hash
  const askRoundRaw = createSignedRound("ASK", "seller", sellerKeypair, baseTimestamp + 1000, intent.intent_id, {
    price: 0.04,
  });
  transcript = addRoundToTranscript(transcript, askRoundRaw);
  
  // Add ACCEPT round (round 2) - addRoundToTranscript will use round 1's round_hash
  const acceptRoundRaw = createSignedRound("ACCEPT", "buyer", buyerKeypair, baseTimestamp + 2000, intent.intent_id, {
    price: 0.04,
  });
  transcript = addRoundToTranscript(transcript, acceptRoundRaw);

  // Print results
  console.log("═══════════════════════════════════════════════════════════");
  if (result.success) {
    console.log("  ✅ Negotiation Complete!");
    console.log("═══════════════════════════════════════════════════════════\n");
    console.log("  📊 Result:");
    console.log(`     Outcome: ✅ Success`);
    console.log(`     Agreed Price: $0.04`);
    console.log(`     Policy Hash: ${result.policy_hash.substring(0, 16)}...`);
    console.log(`     Transcript ID: ${transcript.transcript_id}`);
    console.log(`     Rounds: ${transcript.rounds.length}`);
    console.log(`     Evidence Refs: ${result.evidence_refs.length}\n`);

    // Save transcript
    const transcriptPath = path.join(transcriptDir, `${transcript.transcript_id}.json`);
    fs.writeFileSync(transcriptPath, JSON.stringify(transcript, null, 2));
    console.log("  📄 Transcript:");
    console.log(`     Path: ${transcriptPath}\n`);

    // Replay transcript to verify
    console.log("  🔍 Verifying Transcript...");
    const replayResult = await replayTranscriptV4(transcript);
    if (replayResult.ok && replayResult.integrity_status === "VALID") {
      console.log("     ✓ Integrity: VALID");
      console.log(`     ✓ Signatures verified: ${replayResult.signature_verifications}`);
      console.log(`     ✓ Hash chain verified: ${replayResult.hash_chain_verifications} rounds\n`);
    } else {
      console.log(`     ❌ Integrity: ${replayResult.integrity_status}`);
      console.log(`     Errors: ${replayResult.errors.map(e => e.message).join(", ")}\n`);
    }

    console.log("═══════════════════════════════════════════════════════════");
    console.log("  🎉 Demo Complete!");
    console.log("═══════════════════════════════════════════════════════════\n");
    console.log("  What you just saw:");
    console.log("    • Pact Boundary Runtime (non-bypassable policy enforcement)");
    console.log("    • Policy-as-Code v4 (deterministic evaluation)");
    console.log("    • v4 Transcript (hash-linked, cryptographically verifiable)");
    console.log("    • Evidence embedded (policy hash, evaluation traces)\n");
    console.log("  Next steps:");
    console.log("    • Replay: pnpm replay:v4 " + transcriptPath);
    console.log("    • Evidence bundle: pnpm evidence:bundle " + transcriptPath);
    console.log("    • Read: docs/v4/STATUS.md\n");

    process.exit(0);
  } else {
    console.log("  ❌ Negotiation Failed");
    console.log("═══════════════════════════════════════════════════════════\n");
    console.log("  📊 Failure Event:");
    if (result.failure_event) {
      console.log(`     Code: ${result.failure_event.code}`);
      console.log(`     Stage: ${result.failure_event.stage}`);
      console.log(`     Fault Domain: ${result.failure_event.fault_domain}`);
      console.log(`     Evidence Refs: ${result.failure_event.evidence_refs.length}\n`);
    }

    // Save transcript even on failure
    const transcriptPath = path.join(transcriptDir, `${result.transcript.transcript_id}.json`);
    fs.writeFileSync(transcriptPath, JSON.stringify(result.transcript, null, 2));
    console.log("  📄 Transcript saved (includes failure event):");
    console.log(`     Path: ${transcriptPath}\n`);

    process.exit(1);
  }
}

main().catch((error) => {
  console.error("\n❌ Fatal error:", error);
  process.exit(1);
});
