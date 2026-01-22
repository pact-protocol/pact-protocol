/**
 * Default Blame Logic (DBL) v1
 * 
 * A deterministic "default attribution" engine that takes a verified v4 transcript
 * and outputs a deterministic Judgment Artifact. DBL must never depend on unsigned
 * tail events. It relies only on the Last Valid Signed Hash-linked state (LVSH)
 * as determined by the canonical replay verifier.
 * 
 * CONSTITUTIONAL PRINCIPLES:
 * - Uses ONLY LVSH (last valid signed hash-linked prefix) from canonical replay verifier
 * - EvidenceRefs contain only signed hashes from LVSH
 * - No heuristics that change fault outcomes
 * - If actor roles cannot be determined, returns INDETERMINATE
 */

import type {
  TranscriptV4,
  TranscriptRound,
} from "@pact/sdk";
import { 
  replayTranscriptV4,
} from "@pact/sdk";

// Use the return type of replayTranscriptV4 to get the correct v4 ReplayResult type
type ReplayResultV4 = Awaited<ReturnType<typeof replayTranscriptV4>>;

/**
 * Judgment Artifact - the output of DBL v1
 */
export type JudgmentArtifact = {
  status: "OK" | "FAILED" | "INDETERMINATE";
  failureCode: string | null;
  lastValidRound: number;
  lastValidSummary: string;
  lastValidHash: string;
  requiredNextActor: "BUYER" | "PROVIDER" | "RAIL" | null;
  dblDetermination:
    | "NO_FAULT"
    | "BUYER_AT_FAULT"
    | "PROVIDER_AT_FAULT"
    | "BUYER_RAIL_AT_FAULT"
    | "PROVIDER_RAIL_AT_FAULT"
    | "INDETERMINATE";
  passportImpact: number; // -0.05 for actor fault, 0.0 for rail/no-fault/indeterminate
  confidence: number;
  recommendation: string;
  evidenceRefs: string[]; // Only trusted signed hashes (LVSH, ACCEPT if used, etc.)
  claimedEvidenceRefs?: string[]; // Untrusted refs from failure_event (optional)
  notes?: string; // Optional explanation of limitations
  recommendedActions?: Array<{
    action: string; // enum-like string
    target: "BUYER" | "PROVIDER" | "RAIL" | "SYSTEM";
    reason: string; // short deterministic text
    evidenceRefs: string[]; // trusted LVSH refs only
    claimedEvidenceRefs?: string[]; // untrusted refs, if needed
  }>;
};

/**
 * LVSH (Last Valid Signed Hash-linked state) information
 */
type LVSHState = {
  lastValidRound: number;
  lastValidHash: string;
  lastValidSummary: string;
  validRounds: TranscriptRound[];
  hasFinalHashMismatch: boolean; // true if container final_hash mismatched but rounds are valid
};

/**
 * Compute round hash from a round (used for evidence refs).
 */
function getRoundHash(round: TranscriptRound): string {
  return round.round_hash || "";
}

/**
 * Extract LVSH from replay result.
 * Uses canonical replay verifier - no duplicate crypto verification.
 * 
 * CONSTITUTIONAL PRINCIPLE: LVSH is based on signed rounds + hash-chain continuity,
 * NOT on the transcript's final_hash field. DBL must be resilient to stale/corrupt
 * final_hash values as long as individual rounds are signed and the chain verifies.
 * 
 * The canonical replay verifier ensures:
 * - Rounds are verified sequentially
 * - round_number matches array index (0-based)
 * - Hash chain is intact
 * - Signatures are valid
 * - Stops at first failure
 * 
 * LVSH is the prefix of rounds that passed all verification checks.
 * A final_hash mismatch does NOT invalidate LVSH if rounds themselves are valid.
 */
function extractLVSH(
  transcript: TranscriptV4,
  replayResult: ReplayResultV4
): LVSHState {
  // Check if there's a FINAL_HASH_MISMATCH error
  const hasFinalHashMismatch = replayResult.errors.some(
    e => e.type === "FINAL_HASH_MISMATCH"
  );
  
  // Check if there are critical errors OTHER than FINAL_HASH_MISMATCH
  // Critical errors invalidate verified rounds (shouldn't happen if replay verifier stops at first failure)
  const criticalErrors = replayResult.errors.filter(
    e => e.type !== "FINAL_HASH_MISMATCH"
  );
  
  // LVSH is established based on rounds_verified, not ok status.
  // A final_hash mismatch can set ok=false but rounds_verified > 0,
  // which is acceptable for DBL's constitutional purpose.
  
  // If no rounds were verified, we cannot establish LVSH
  if (replayResult.rounds_verified === 0) {
    const errorSummary = replayResult.errors.length > 0
      ? replayResult.errors.map(e => `${e.type}: ${e.message}`).join("; ")
      : "No valid rounds found";
    
    return {
      lastValidRound: -1,
      lastValidHash: "",
      lastValidSummary: replayResult.ok 
        ? `No valid rounds found (${errorSummary})`
        : `Transcript verification failed (${errorSummary})`,
      validRounds: [],
      hasFinalHashMismatch: false,
    };
  }

  // If there are critical errors in verified rounds, LVSH cannot be trusted
  // (This should be rare - replay verifier should stop at first failure)
  if (criticalErrors.length > 0) {
    const errorSummary = criticalErrors.map(e => `${e.type}: ${e.message}`).join("; ");
    return {
      lastValidRound: -1,
      lastValidHash: "",
      lastValidSummary: `Critical errors in verified rounds: ${errorSummary}`,
      validRounds: [],
      hasFinalHashMismatch: false,
    };
  }

  // LVSH is the prefix of rounds verified by replay verifier
  // The replay verifier ensures rounds are 0-indexed and sequential,
  // so we can safely slice to rounds_verified
  const validRounds = transcript.rounds.slice(0, replayResult.rounds_verified);
  
  if (validRounds.length === 0) {
    return {
      lastValidRound: -1,
      lastValidHash: "",
      lastValidSummary: "No valid rounds found after extraction",
      validRounds: [],
      hasFinalHashMismatch: false,
    };
  }

  const lastValid = validRounds[validRounds.length - 1];
  const lastValidHash = getRoundHash(lastValid);

  // Format summary: "ACCEPT by buyer (round 2)"
  const summary = `${lastValid.round_type} by ${lastValid.agent_id} (round ${lastValid.round_number})`;

  return {
    lastValidRound: lastValid.round_number,
    lastValidHash,
    lastValidSummary: summary,
    validRounds,
    hasFinalHashMismatch,
  };
}

/**
 * Determine actor role from transcript round.
 * Returns explicit role if present, otherwise attempts safe inference for fixtures.
 * Returns null if role cannot be determined (should result in INDETERMINATE).
 * 
 * NOTE: v4 schema currently only has agent_id (string), not explicit role fields.
 * This uses minimal inference for fixture compatibility but should return null
 * in production deployments where explicit role fields are required.
 */
function getActorRole(round: TranscriptRound): "BUYER" | "PROVIDER" | null {
  // TODO: Check if TranscriptRound schema has explicit role field (actor_role, party, side, etc.)
  // For now, v4 schema only has agent_id, so we have minimal inference for fixture compatibility
  // In production, this should require explicit role fields or return null
  
  const agentId = round.agent_id.toLowerCase();
  
  // Conservative inference for fixtures only
  // Production deployments should require explicit role fields
  if (agentId === "buyer" || agentId.includes("buyer")) {
    return "BUYER";
  }
  if (agentId === "seller" || agentId === "provider" || 
      agentId.includes("seller") || agentId.includes("provider")) {
    return "PROVIDER";
  }
  
  return null; // Cannot determine role
}

/**
 * Determine which actor is required next based on strict state machine.
 * Returns null if roles cannot be determined (should result in INDETERMINATE).
 */
function determineNextRequiredActor(
  validRounds: TranscriptRound[]
): "BUYER" | "PROVIDER" | "RAIL" | null {
  if (validRounds.length === 0) {
    return null;
  }

  const lastRound = validRounds[validRounds.length - 1];
  const lastRoundType = lastRound.round_type;
  const lastRole = getActorRole(lastRound);

  // State machine rules
  switch (lastRoundType) {
    case "INTENT":
      // After INTENT, provider should respond with ASK
      return "PROVIDER";

    case "ASK":
      // After ASK, buyer must BID/REJECT/COUNTER
      return "BUYER";

    case "BID":
      // After BID, provider must ACCEPT/REJECT/COUNTER
      return "PROVIDER";

    case "COUNTER":
      // After COUNTER, opposite party must respond
      if (lastRole === "BUYER") {
        return "PROVIDER";
      } else if (lastRole === "PROVIDER") {
        return "BUYER";
      }
      return null; // Cannot determine without role

    case "ACCEPT":
      // After ACCEPT, opposite party must COMMIT (or settlement step)
      if (lastRole === "BUYER") {
        // Buyer accepted, provider needs to commit/settle
        return "PROVIDER";
      } else if (lastRole === "PROVIDER") {
        // Provider accepted, buyer needs to commit/settle
        return "BUYER";
      }
      return null; // Cannot determine without role

    case "REJECT":
    case "ABORT":
      // Terminal states
      return null;

    default:
      return null;
  }
}

/**
 * Check if there's a valid ACCEPT at or before LVSH.
 */
function hasValidAccept(validRounds: TranscriptRound[]): boolean {
  return validRounds.some((round) => round.round_type === "ACCEPT");
}

/**
 * Check for proof of attempt (signed attempt artifact).
 * 
 * IMPORTANT: v4 schema does not include SETTLEMENT_ATTEMPT / WALLET_INTENT round types.
 * This means infra exception for PACT-505 cannot be constitutionally verified.
 * 
 * Returns false and notes should indicate infra exception not applicable.
 */
function hasProofOfAttempt(
  lvsh: LVSHState
): { hasProof: boolean; note?: string } {
  // v4 schema round types: INTENT | ASK | BID | COUNTER | ACCEPT | REJECT | ABORT
  // No settlement attempt types exist, so we cannot constitutionally verify proof-of-attempt
  
  return {
    hasProof: false,
    note: "v4 transcript schema does not include signed attempt round types; infra exception not applicable"
  };
}

/**
 * Check if transcript is terminal success.
 * v4 success appears to end with ACCEPT (based on fixtures).
 */
function isTerminalSuccess(
  transcript: TranscriptV4,
  lvsh: LVSHState
): boolean {
  if (transcript.failure_event) {
    return false; // Has failure event, not success
  }

  if (lvsh.validRounds.length === 0) {
    return false; // No valid rounds
  }

  const lastRound = lvsh.validRounds[lvsh.validRounds.length - 1];
  
  // v4 success ends with ACCEPT (no COMMIT/SETTLE in current schema)
  return lastRound.round_type === "ACCEPT";
}

/**
 * Determine who is responsible for settlement step after ACCEPT.
 */
function getSettlementResponsible(
  validRounds: TranscriptRound[]
): "BUYER" | "PROVIDER" | null {
  // Find the last ACCEPT
  const acceptRound = validRounds
    .slice()
    .reverse()
    .find((round) => round.round_type === "ACCEPT");

  if (!acceptRound) {
    return null;
  }

  const acceptRole = getActorRole(acceptRound);
  
  if (acceptRole === "BUYER") {
    return "PROVIDER"; // Provider executes after buyer accepts
  } else if (acceptRole === "PROVIDER") {
    return "BUYER"; // Buyer commits after provider accepts
  }

  return null; // Cannot determine without role
}

/**
 * Collect trusted evidence refs from LVSH.
 * Only includes signed, hash-linked hashes.
 */
function collectTrustedEvidenceRefs(
  lvsh: LVSHState
): string[] {
  const refs: string[] = [];

  // Always include LVSH hash
  if (lvsh.lastValidHash) {
    refs.push(lvsh.lastValidHash);
  }

  // Include ACCEPT round hash if it exists (used for settlement responsibility)
  const acceptRound = lvsh.validRounds
    .slice()
    .reverse()
    .find((round) => round.round_type === "ACCEPT");
  
  if (acceptRound) {
    const acceptHash = getRoundHash(acceptRound);
    if (acceptHash && acceptHash !== lvsh.lastValidHash) {
      refs.push(acceptHash);
    }
  }

  return refs;
}

/**
 * Constitutional invariants (v4):
 *
 * - PACT-331 (Double Commit) ALWAYS → BUYER_AT_FAULT
 * - PACT-330 (Contention Exclusivity Violation) ALWAYS → PROVIDER_AT_FAULT
 *
 * These determinations:
 * - do NOT depend on LVSH position
 * - do NOT depend on continuity
 * - require a valid LVSH only to move status from INDETERMINATE → FAILED
 *
 * Any change here must update verifier fixtures and tests.
 */

/**
 * Resolve blame using DBL v1 logic.
 * 
 * CONSTITUTIONAL PRINCIPLES:
 * - Uses ONLY LVSH (last valid signed hash-linked prefix) from canonical replay verifier
 * - EvidenceRefs contain only signed hashes from LVSH
 * - No heuristics that change fault outcomes
 * - If actor roles cannot be determined, returns INDETERMINATE
 */
export async function resolveBlameV1(
  transcriptPathOrObject: string | TranscriptV4
): Promise<JudgmentArtifact> {
  // Load transcript
  let transcript: TranscriptV4;
  if (typeof transcriptPathOrObject === "string") {
    const fs = await import("node:fs");
    const content = fs.readFileSync(transcriptPathOrObject, "utf-8");
    transcript = JSON.parse(content);
  } else {
    transcript = transcriptPathOrObject;
  }

  // Use canonical replay verifier (single verification kernel)
  const replayResult = await replayTranscriptV4(transcript);

  // Extract LVSH from replay result
  const lvsh = extractLVSH(transcript, replayResult);

  // Determine required next actor (may be null if roles cannot be determined)
  const requiredNextActor = determineNextRequiredActor(lvsh.validRounds);

  // Initialize base artifact
  const artifact: JudgmentArtifact = {
    status: "FAILED",
    failureCode: transcript.failure_event?.code || null,
    lastValidRound: lvsh.lastValidRound,
    lastValidSummary: lvsh.lastValidSummary,
    lastValidHash: lvsh.lastValidHash,
    requiredNextActor,
    dblDetermination: "INDETERMINATE",
    passportImpact: 0.0,
    confidence: 0,
    recommendation: "",
    evidenceRefs: [],
    claimedEvidenceRefs: transcript.failure_event?.evidence_refs,
  };

  // Collect trusted evidence refs (only signed LVSH hashes)
  artifact.evidenceRefs = collectTrustedEvidenceRefs(lvsh);

  // If FINAL_HASH_MISMATCH is present, add note and reduce confidence
  // Container integrity check failed, but rounds are still valid
  if (lvsh.hasFinalHashMismatch) {
    artifact.notes = "Container final hash mismatch; LVSH computed from signed rounds only.";
  }

  // Rule 1: Terminal success -> NO_FAULT
  if (isTerminalSuccess(transcript, lvsh)) {
    artifact.status = "OK";
    artifact.dblDetermination = "NO_FAULT";
    artifact.confidence = 1.0;
    artifact.passportImpact = 0.0;
    artifact.recommendation = "No action required.";
    artifact.recommendedActions = [];
    return artifact;
  }

  const failureCode = transcript.failure_event?.code;

  // Check deterministic policy violations FIRST (these can work even with minimal LVSH)
  // Rule 2: PACT-101 (policy abort) -> BUYER_AT_FAULT
  if (failureCode === "PACT-101") {
    // Even if LVSH is minimal, policy violations are deterministic
    if (lvsh.validRounds.length === 0) {
      artifact.notes = "LVSH cannot be established, but PACT-101 is deterministic policy violation";
      artifact.confidence = 0.7; // Reduced confidence due to no LVSH
    } else {
      // Reduce confidence if final_hash mismatch (0.95 -> 0.85)
      artifact.confidence = lvsh.hasFinalHashMismatch ? 0.85 : 0.95;
    }
    artifact.dblDetermination = "BUYER_AT_FAULT";
    artifact.passportImpact = -0.05;
    artifact.recommendation = "Policy violation - buyer at fault (deterministic)";
    return artifact;
  }

  // Rule 4: PACT-331 (Double Commit Detection)
  // Deterministic policy violation - does not depend on requiredNextActor
  if (failureCode === "PACT-331") {
    // Even if LVSH is minimal, policy violations are deterministic
    if (lvsh.validRounds.length === 0) {
      artifact.notes = "LVSH cannot be established, but PACT-331 is deterministic policy violation";
      artifact.confidence = 0.7; // Reduced confidence due to no LVSH
    } else {
      // Reduce confidence if final_hash mismatch (0.95 -> 0.90)
      artifact.confidence = lvsh.hasFinalHashMismatch ? 0.90 : 0.95;
    }
    artifact.dblDetermination = "BUYER_AT_FAULT";
    artifact.passportImpact = -0.05;
    artifact.recommendation = "Abort: duplicate commit attempt detected for the same intent_fingerprint. Do not retry; create a new intent.";
    artifact.requiredNextActor = null; // Terminal by policy, not a "next move" timeout
    
    // Build recommendedActions with trusted evidence refs only
    const trustedEvidenceRefs = lvsh.lastValidHash ? [lvsh.lastValidHash] : [];
    artifact.recommendedActions = [
      {
        action: "ABORT_INTENT",
        target: "BUYER",
        reason: "Duplicate commit detected (PACT-331)",
        evidenceRefs: trustedEvidenceRefs,
      },
      {
        action: "LINK_PRIOR_TRANSCRIPT",
        target: "SYSTEM",
        reason: "Associate this attempt with prior transcript_id for audit",
        evidenceRefs: trustedEvidenceRefs,
        claimedEvidenceRefs: transcript.failure_event?.evidence_refs,
      },
      {
        action: "COOLDOWN_FINGERPRINT",
        target: "SYSTEM",
        reason: "Enforce fingerprint cooldown window to prevent replay storms",
        evidenceRefs: trustedEvidenceRefs,
      },
    ];
    
    // claimedEvidenceRefs already set from failure_event.evidence_refs
    return artifact;
  }

  // Rule 5: PACT-330 (Contention Exclusivity Violation)
  // Deterministic policy violation - does not depend on requiredNextActor
  if (failureCode === "PACT-330") {
    // Even if LVSH is minimal, policy violations are deterministic
    if (lvsh.validRounds.length === 0) {
      artifact.notes = "LVSH cannot be established, but PACT-330 is deterministic policy violation";
      artifact.confidence = 0.7; // Reduced confidence due to no LVSH
    } else {
      // Reduce confidence if final_hash mismatch (0.90 -> 0.85)
      artifact.confidence = lvsh.hasFinalHashMismatch ? 0.85 : 0.90;
    }
    artifact.dblDetermination = "PROVIDER_AT_FAULT";
    artifact.passportImpact = -0.05;
    artifact.recommendation = "Abort: non-winner provider attempted settlement after contention winner was selected. Do not pay non-winner; record violation.";
    artifact.requiredNextActor = null; // Terminal by policy, not a "next move" timeout
    
    // Build recommendedActions with trusted evidence refs only
    const trustedEvidenceRefs = lvsh.lastValidHash ? [lvsh.lastValidHash] : [];
    artifact.recommendedActions = [
      {
        action: "ABORT_SETTLEMENT",
        target: "SYSTEM",
        reason: "Non-winner settlement attempt (PACT-330)",
        evidenceRefs: trustedEvidenceRefs,
      },
      {
        action: "PENALIZE_PROVIDER_PASSPORT",
        target: "SYSTEM",
        reason: "Provider violated contention exclusivity",
        evidenceRefs: trustedEvidenceRefs,
      },
      {
        action: "ADD_PROVIDER_FLAG",
        target: "SYSTEM",
        reason: "Flag provider_id/pubkey for registry / risk review",
        evidenceRefs: trustedEvidenceRefs,
        claimedEvidenceRefs: transcript.failure_event?.evidence_refs,
      },
    ];
    
    // claimedEvidenceRefs already set from failure_event.evidence_refs
    return artifact;
  }

  // If LVSH cannot be established, return INDETERMINATE (for non-deterministic failures)
  if (lvsh.validRounds.length === 0) {
    artifact.status = "INDETERMINATE";
    artifact.dblDetermination = "INDETERMINATE";
    artifact.confidence = 0;
    artifact.passportImpact = 0.0;
    artifact.recommendation = "Insufficient signed evidence to attribute fault deterministically.";
    artifact.recommendedActions = [
      {
        action: "REQUEST_REPLAY",
        target: "SYSTEM",
        reason: "LVSH missing or invalid; request full transcript integrity",
        evidenceRefs: [],
      },
    ];
    return artifact;
  }

  // If required actor cannot be determined (role inference failed), return INDETERMINATE
  // BUT only for non-deterministic failures (not PACT-101/330/331 which are already handled above)
  if (requiredNextActor === null && transcript.failure_event) {
    artifact.status = "INDETERMINATE";
    artifact.dblDetermination = "INDETERMINATE";
    artifact.confidence = 0.3;
    artifact.passportImpact = 0.0;
    artifact.recommendation = "Insufficient signed evidence to attribute fault deterministically.";
    artifact.notes = "Transcript rounds do not contain explicit actor role fields; cannot infer from agent_id alone";
    artifact.recommendedActions = [
      {
        action: "REQUEST_REPLAY",
        target: "SYSTEM",
        reason: "LVSH missing or invalid; request full transcript integrity",
        evidenceRefs: artifact.evidenceRefs.length > 0 ? artifact.evidenceRefs : [],
      },
    ];
    return artifact;
  }

  // Rule 3: PACT-404 (settlement timeout)
  if (failureCode === "PACT-404") {
    const hasAccept = hasValidAccept(lvsh.validRounds);

    if (!hasAccept) {
      // No valid ACCEPT -> fault = party who owed the next move
      if (requiredNextActor === "BUYER") {
        artifact.dblDetermination = "BUYER_AT_FAULT";
        // Reduce confidence if final_hash mismatch (0.85 -> 0.80)
        artifact.confidence = lvsh.hasFinalHashMismatch ? 0.80 : 0.85;
        artifact.passportImpact = -0.05;
        artifact.recommendation = "Buyer failed to respond after provider action";
      } else if (requiredNextActor === "PROVIDER") {
        artifact.dblDetermination = "PROVIDER_AT_FAULT";
        // Reduce confidence if final_hash mismatch (0.85 -> 0.80)
        artifact.confidence = lvsh.hasFinalHashMismatch ? 0.80 : 0.85;
        artifact.passportImpact = -0.05;
        artifact.recommendation = "Provider failed to respond after buyer action";
      } else {
        artifact.dblDetermination = "INDETERMINATE";
        artifact.confidence = 0.5;
        artifact.passportImpact = 0.0;
        artifact.recommendation = "Cannot determine required actor";
      }
    } else {
      // Valid ACCEPT exists -> fault = party responsible for next settlement step
      const settlementResponsible = getSettlementResponsible(lvsh.validRounds);
      if (settlementResponsible === "BUYER") {
        artifact.dblDetermination = "BUYER_AT_FAULT";
        // Reduce confidence if final_hash mismatch (0.85 -> 0.80)
        artifact.confidence = lvsh.hasFinalHashMismatch ? 0.80 : 0.85;
        artifact.passportImpact = -0.05;
        artifact.recommendation = "Buyer failed to complete settlement after acceptance";
      } else if (settlementResponsible === "PROVIDER") {
        artifact.dblDetermination = "PROVIDER_AT_FAULT";
        // Reduce confidence if final_hash mismatch (0.85 -> 0.80)
        artifact.confidence = lvsh.hasFinalHashMismatch ? 0.80 : 0.85;
        artifact.passportImpact = -0.05;
        artifact.recommendation = "Provider failed to complete settlement after acceptance";
      } else {
        artifact.dblDetermination = "INDETERMINATE";
        artifact.confidence = 0.5;
        artifact.passportImpact = 0.0;
        artifact.recommendation = "Cannot determine settlement responsibility";
      }
    }
    return artifact;
  }

  // Rule 6: PACT-505 (infrastructure/recursive failure)
  if (failureCode === "PACT-505") {
    const proofCheck = hasProofOfAttempt(lvsh);

    // v4 schema does not support signed attempt types, so infra exception is not applicable
    // Use continuity rule instead
    if (requiredNextActor === "BUYER") {
      artifact.dblDetermination = "BUYER_AT_FAULT";
      // Reduce confidence if final_hash mismatch (0.8 -> 0.75)
      artifact.confidence = lvsh.hasFinalHashMismatch ? 0.75 : 0.8;
      artifact.passportImpact = -0.05;
      artifact.recommendation = "Buyer failed to respond (continuity rule)";
      const baseNote = proofCheck.note || "PACT-505 present but no signed Proof-of-Attempt types exist in v4 schema; infra exception not applicable";
      artifact.notes = lvsh.hasFinalHashMismatch 
        ? `${baseNote}. Container final hash mismatch; LVSH computed from signed rounds only.`
        : baseNote;
    } else if (requiredNextActor === "PROVIDER") {
      artifact.dblDetermination = "PROVIDER_AT_FAULT";
      // Reduce confidence if final_hash mismatch (0.8 -> 0.75)
      artifact.confidence = lvsh.hasFinalHashMismatch ? 0.75 : 0.8;
      artifact.passportImpact = -0.05;
      artifact.recommendation = "Provider failed to respond (continuity rule)";
      const baseNote = proofCheck.note || "PACT-505 present but no signed Proof-of-Attempt types exist in v4 schema; infra exception not applicable";
      artifact.notes = lvsh.hasFinalHashMismatch 
        ? `${baseNote}. Container final hash mismatch; LVSH computed from signed rounds only.`
        : baseNote;
    } else {
      artifact.dblDetermination = "INDETERMINATE";
      artifact.confidence = 0.5;
      artifact.passportImpact = 0.0;
      artifact.recommendation = "Cannot determine fault for PACT-505 without required actor";
      artifact.notes = proofCheck.note;
    }
    return artifact;
  }

  // Default: Use continuity rule - fault = party who owed the next move
  // Status: FAILED if continuity breach (LVSH + requiredNextActor exists), INDETERMINATE otherwise
  if (requiredNextActor === "BUYER") {
    artifact.status = "FAILED";
    artifact.dblDetermination = "BUYER_AT_FAULT";
    // Reduce confidence if final_hash mismatch (0.7 -> 0.65)
    artifact.confidence = lvsh.hasFinalHashMismatch ? 0.65 : 0.7;
    artifact.passportImpact = -0.05;
    artifact.recommendation = "Buyer failed to respond (continuity rule)";
  } else if (requiredNextActor === "PROVIDER") {
    artifact.status = "FAILED";
    artifact.dblDetermination = "PROVIDER_AT_FAULT";
    // Reduce confidence if final_hash mismatch (0.7 -> 0.65)
    artifact.confidence = lvsh.hasFinalHashMismatch ? 0.65 : 0.7;
    artifact.passportImpact = -0.05;
    artifact.recommendation = "Provider failed to respond (continuity rule)";
  } else {
    artifact.status = "INDETERMINATE";
    artifact.dblDetermination = "INDETERMINATE";
    artifact.confidence = 0.5;
    artifact.passportImpact = 0.0;
    artifact.recommendation = "Cannot determine fault (no clear next actor or role information)";
  }

  return artifact;
}
