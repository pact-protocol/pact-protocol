#!/usr/bin/env node
/**
 * Generate Art Acquisition Pilot v0.4 fixture (ART-001-art-acquisition-success.json).
 * Deterministic keys from seeds; rounds: INTENT -> ASK (evidence) -> ASK (rerun) -> ACCEPT.
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

const fixturesDir = path.join(__dirname, "..", "fixtures", "art");
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

// Deterministic keypairs (Art Acquisition Pilot v0.4)
const keypairs = {
  buyer: deriveKeypair("art-buyer-v1"),
  gallery: deriveKeypair("art-gallery-v1"),
  imaging_v2: deriveKeypair("art-imaging-v2-v1"),
  imaging_v1: deriveKeypair("art-imaging-v1-v1"),
  provenance: deriveKeypair("art-provenance-v1"),
  expert_a: deriveKeypair("art-expert-a-v1"),
  expert_b: deriveKeypair("art-expert-b-v1"),
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

const baseTime = 1700000000000; // deterministic base

function createArtAcquisitionSuccess() {
  const intentId = "intent-art-001-art-acquisition";
  const createdAt = baseTime;
  const transcriptId = `transcript-${sha256(intentId + createdAt).substring(0, 64)}`;
  const initialHash = computeInitialHash(intentId, createdAt);

  // Round 0 INTENT (Buyer): art.acquisition, budget_max, min_confidence, subject
  const intentPayload = {
    type: "INTENT",
    intent_id: intentId,
    intent_type: "art.acquisition",
    budget_max: 500000,
    min_confidence: 0.9,
    subject: "ArtworkX",
  };
  const envelopeHash0 = sha256(stableCanonicalize(intentPayload));
  const round0 = createRound(0, "INTENT", "buyer", createdAt, initialHash, envelopeHash0, {
    intent_type: "art.acquisition",
    budget_max: 500000,
    min_confidence: 0.9,
    subject: "ArtworkX",
  });

  // Round 1 ASK (Gallery): evidence gathering - Imaging v1, Provenance (experts sign their own rounds below)
  const galleryClaimsPayload = {
    type: "ASK",
    intent_id: intentId,
    claims: [
      {
        agent: "imaging_v1",
        subject: "art:authenticity:ArtworkX",
        authenticity_likelihood: true,
        conf: 0.65,
      },
      {
        agent: "provenance",
        subject: "art:provenance:ArtworkX",
        provenance_valid: true,
        conf: 0.92,
      },
    ],
  };
  const envelopeHash1 = sha256(stableCanonicalize(galleryClaimsPayload));
  const round1 = createRound(1, "ASK", "gallery", createdAt + 1000, round0.round_hash, envelopeHash1, {
    claims: galleryClaimsPayload.claims,
  });

  // Round 2 ASK (Expert A): signed expert opinion - real party/signer
  const expertAPayload = {
    type: "ASK",
    intent_id: intentId,
    claims: [
      {
        claim_type: "expert_opinion",
        subject: "art:authenticity:ArtworkX",
        value: "Likely authentic",
        confidence: 0.9,
      },
    ],
  };
  const envelopeHashExpertA = sha256(stableCanonicalize(expertAPayload));
  const round2 = createRound(2, "ASK", "expert_a", createdAt + 1500, round1.round_hash, envelopeHashExpertA, {
    claims: expertAPayload.claims,
  });

  // Round 3 ASK (Expert B): signed expert opinion - real party/signer
  const expertBPayload = {
    type: "ASK",
    intent_id: intentId,
    claims: [
      {
        claim_type: "expert_opinion",
        subject: "art:authenticity:ArtworkX",
        value: "Concerns remain",
        confidence: 0.7,
      },
    ],
  };
  const envelopeHashExpertB = sha256(stableCanonicalize(expertBPayload));
  const round3 = createRound(3, "ASK", "expert_b", createdAt + 1750, round2.round_hash, envelopeHashExpertB, {
    claims: expertBPayload.claims,
  });

  // Round 4 ASK (Imaging v2): rerun / escalation - high confidence
  const rerunPayload = {
    type: "ASK",
    intent_id: intentId,
    claims: [
      {
        agent: "imaging_v2",
        subject: "art:authenticity:ArtworkX",
        authenticity_likelihood: true,
        conf: 0.93,
      },
    ],
  };
  const envelopeHash4 = sha256(stableCanonicalize(rerunPayload));
  const round4 = createRound(4, "ASK", "imaging_v2", createdAt + 2000, round3.round_hash, envelopeHash4, {
    claims: rerunPayload.claims,
  });

  // Round 5 ACCEPT (Buyer): economic terms
  const acceptPayload = {
    type: "ACCEPT",
    intent_id: intentId,
    asset: "USD",
    amount: 300000,
    from: pubkeys.buyer,
    to: pubkeys.gallery,
    settlement_rail: "stripe_like",
  };
  const envelopeHash5 = sha256(stableCanonicalize(acceptPayload));
  const round5 = createRound(5, "ACCEPT", "buyer", createdAt + 3000, round4.round_hash, envelopeHash5, {
    asset: "USD",
    amount: 300000,
    from: pubkeys.buyer,
    to: pubkeys.gallery,
    settlement_rail: "stripe_like",
  });

  const rounds = [round0, round1, round2, round3, round4, round5];
  const transcript = {
    transcript_version: "pact-transcript/4.0",
    transcript_id: transcriptId,
    intent_id: intentId,
    intent_type: "art.acquisition",
    created_at_ms: createdAt,
    policy_hash: sha256(stableCanonicalize({ art_acquisition: true, min_confidence: 0.9 })),
    strategy_hash: sha256(stableCanonicalize({ strategy: "evidence_then_accept" })),
    identity_snapshot_hash: sha256(stableCanonicalize({ buyer: "art-buyer", gallery: "art-gallery" })),
    rounds,
  };
  transcript.final_hash = computeTranscriptHash(transcript);

  return { transcript, pubkeys };
}

const { transcript, pubkeys: exportedPubkeys } = createArtAcquisitionSuccess();
const outPath = path.join(fixturesDir, "ART-001-art-acquisition-success.json");
fs.writeFileSync(outPath, JSON.stringify(transcript, null, 2), "utf8");
console.log("Generated:", outPath);

// Export pubkeys for anchors (same keys used in fixture)
const anchorsInfoPath = path.join(fixturesDir, "_art_pubkeys.json");
fs.writeFileSync(
  anchorsInfoPath,
  JSON.stringify(
    {
      gallery: exportedPubkeys.gallery,
      expert_a: exportedPubkeys.expert_a,
      expert_b: exportedPubkeys.expert_b,
      provenance: exportedPubkeys.provenance,
      buyer: exportedPubkeys.buyer,
      imaging_v2: exportedPubkeys.imaging_v2,
    },
    null,
    2
  ),
  "utf8"
);
console.log("Pubkeys (for anchors):", anchorsInfoPath);
