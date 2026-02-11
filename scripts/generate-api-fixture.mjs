#!/usr/bin/env node
/**
 * Generate Autonomous API Procurement Pilot v0.4 fixture (API-001-autonomous-procurement-success.json).
 * Rounds: INTENT -> ASK (Provider A quote) -> ASK (Provider B quote) -> ACCEPT (select B) -> ASK (Verifier).
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const requireRoot = createRequire(import.meta.url);
const crypto = requireRoot("crypto");
const fs = requireRoot("fs");
const path = requireRoot("path");
const nacl = requireRoot("tweetnacl");
const bs58 = requireRoot("bs58");

const fixturesDir = path.join(__dirname, "..", "fixtures", "api");
if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true });
}

function stableCanonicalize(obj) {
  if (obj === null || obj === undefined) return JSON.stringify(obj);
  if (typeof obj === "string" || typeof obj === "number" || typeof obj === "boolean")
    return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map((item) => stableCanonicalize(item)).join(",") + "]";
  if (typeof obj === "object") {
    const keys = Object.keys(obj).sort();
    return "{" + keys.map((key) => JSON.stringify(key) + ":" + stableCanonicalize(obj[key])).join(",") + "}";
  }
  return JSON.stringify(obj);
}

function sha256(input) {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function deriveKeypair(seed) {
  const hash = crypto.createHash("sha256").update(seed).digest();
  return nacl.sign.keyPair.fromSeed(new Uint8Array(hash));
}

function computeInitialHash(intentId, createdAtMs) {
  return sha256(`${intentId}:${createdAtMs}`);
}

function computeRoundHash(round) {
  const { round_hash, ...rest } = round;
  return sha256(stableCanonicalize(rest));
}

function computeTranscriptHash(transcript) {
  const { final_hash, ...rest } = transcript;
  return sha256(stableCanonicalize(rest));
}

function signEnvelopeHash(envelopeHash, keypair) {
  const hashBytes = Buffer.from(envelopeHash, "hex");
  const sigBytes = nacl.sign.detached(hashBytes, keypair.secretKey);
  return bs58.encode(Buffer.from(sigBytes));
}

const keypairs = {
  buyer: deriveKeypair("api-buyer-v1"),
  provider_a: deriveKeypair("api-provider-a-v1"),
  provider_b: deriveKeypair("api-provider-b-v1"),
  verifier: deriveKeypair("api-verifier-v1"),
};
const pubkeys = Object.fromEntries(
  Object.entries(keypairs).map(([k, v]) => [k, bs58.encode(Buffer.from(v.publicKey))])
);

function createRound(roundNumber, roundType, agentKey, timestamp, previousHash, envelopeHash, contentSummary = {}) {
  const keypair = keypairs[agentKey];
  const pubKey = pubkeys[agentKey];
  const round = {
    round_number: roundNumber,
    round_type: roundType,
    message_hash: envelopeHash.substring(0, 64),
    envelope_hash: envelopeHash,
    signature: {
      signer_public_key_b58: pubKey,
      signature_b58: signEnvelopeHash(envelopeHash, keypair),
      signed_at_ms: timestamp,
      scheme: "ed25519",
    },
    timestamp_ms: timestamp,
    previous_round_hash: previousHash,
    agent_id: agentKey,
    public_key_b58: pubKey,
    content_summary: contentSummary,
  };
  round.round_hash = computeRoundHash(round);
  return round;
}

const baseTime = 1700100000000;

function createApiProcurementSuccess() {
  const intentId = "intent-api-001-autonomous-procurement";
  const createdAt = baseTime;
  const transcriptId = `transcript-${sha256(intentId + createdAt).substring(0, 64)}`;
  const initialHash = computeInitialHash(intentId, createdAt);

  // Round 0 INTENT (Buyer)
  const intentPayload = {
    type: "INTENT",
    intent_id: intentId,
    intent_type: "api.procurement",
    request: "weather data NYC, 24h hourly",
    budget_max: 20,
    sla: "latency <2s",
    min_reliability_gate: 80,
    min_calibration_gate: 70,
  };
  const envelopeHash0 = sha256(stableCanonicalize(intentPayload));
  const round0 = createRound(0, "INTENT", "buyer", createdAt, initialHash, envelopeHash0, {
    intent_type: "api.procurement",
    request: "weather data NYC, 24h hourly",
    budget_max: 20,
    sla: "latency <2s",
    min_reliability_gate: 80,
    min_calibration_gate: 70,
  });

  // Round 1 ASK (Provider A: cheap, low reliability)
  const quoteAPayload = {
    type: "ASK",
    intent_id: intentId,
    quote: { price: 10, sla: "standard" },
    availability: true,
    availability_conf: 0.9,
    estimated_latency_ms: 2500,
    reliability_score: 55,
    calibration_score: 60,
  };
  const envelopeHash1 = sha256(stableCanonicalize(quoteAPayload));
  const round1 = createRound(1, "ASK", "provider_a", createdAt + 1000, round0.round_hash, envelopeHash1, {
    quote: quoteAPayload.quote,
    availability: quoteAPayload.availability,
    availability_conf: quoteAPayload.availability_conf,
    estimated_latency_ms: quoteAPayload.estimated_latency_ms,
    reliability_score: quoteAPayload.reliability_score,
    calibration_score: quoteAPayload.calibration_score,
  });

  // Round 2 ASK (Provider B: higher price, KYB verified, meets gates)
  const quoteBPayload = {
    type: "ASK",
    intent_id: intentId,
    quote: { price: 12, sla: "fast" },
    availability: true,
    availability_conf: 0.9,
    estimated_latency_ms: 1200,
    reliability_score: 85,
    calibration_score: 78,
  };
  const envelopeHash2 = sha256(stableCanonicalize(quoteBPayload));
  const round2 = createRound(2, "ASK", "provider_b", createdAt + 2000, round1.round_hash, envelopeHash2, {
    quote: quoteBPayload.quote,
    availability: quoteBPayload.availability,
    availability_conf: quoteBPayload.availability_conf,
    estimated_latency_ms: quoteBPayload.estimated_latency_ms,
    reliability_score: quoteBPayload.reliability_score,
    calibration_score: quoteBPayload.calibration_score,
  });

  // Round 3 ACCEPT (Buyer: select Provider B, economic terms). Terminal; delivery_verified in outcome_events.
  const acceptPayload = {
    type: "ACCEPT",
    intent_id: intentId,
    selected_provider: pubkeys.provider_b,
    asset: "USD",
    amount: 12,
    from: pubkeys.buyer,
    to: pubkeys.provider_b,
    settlement_rail: "stripe_like",
  };
  const envelopeHash3 = sha256(stableCanonicalize(acceptPayload));
  const round3 = createRound(3, "ACCEPT", "buyer", createdAt + 3000, round2.round_hash, envelopeHash3, {
    selected_provider: pubkeys.provider_b,
    asset: "USD",
    amount: 12,
    from: pubkeys.buyer,
    to: pubkeys.provider_b,
    settlement_rail: "stripe_like",
  });

  const rounds = [round0, round1, round2, round3];
  const transcript = {
    transcript_version: "pact-transcript/4.0",
    transcript_id: transcriptId,
    intent_id: intentId,
    intent_type: "api.procurement",
    created_at_ms: createdAt,
    policy_hash: sha256(stableCanonicalize({ api_procurement: true, min_reliability_gate: 80 })),
    strategy_hash: sha256(stableCanonicalize({ strategy: "trust_gate_then_accept" })),
    identity_snapshot_hash: sha256(stableCanonicalize({ buyer: "api-buyer", provider_b: "api-provider-b" })),
    rounds,
  };
  transcript.final_hash = computeTranscriptHash(transcript);

  return { transcript, pubkeys };
}

const { transcript, pubkeys: exportedPubkeys } = createApiProcurementSuccess();
const outPath = path.join(fixturesDir, "API-001-autonomous-procurement-success.json");
fs.writeFileSync(outPath, JSON.stringify(transcript, null, 2), "utf8");
console.log("Generated:", outPath);

const pubkeysPath = path.join(fixturesDir, "_api_pubkeys.json");
fs.writeFileSync(
  pubkeysPath,
  JSON.stringify(
    {
      buyer: exportedPubkeys.buyer,
      provider_a: exportedPubkeys.provider_a,
      provider_b: exportedPubkeys.provider_b,
      verifier: exportedPubkeys.verifier,
    },
    null,
    2
  ),
  "utf8"
);
console.log("Pubkeys (for anchors):", pubkeysPath);
