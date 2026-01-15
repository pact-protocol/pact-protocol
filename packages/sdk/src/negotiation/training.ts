/**
 * Training Data Format
 * 
 * Helper functions to convert transcripts to training data rows for ML model training.
 * All sensitive data (keys, secrets, PII) is stripped out.
 */

import type { TranscriptV1 } from "../transcript/types";

export type TrainingRow = {
  // Required fields
  intent_type: string;
  constraints: {
    latency_ms: number;
    freshness_sec: number;
  };
  asset?: string;
  chain?: string;
  negotiation_strategy: string;
  rounds_summary: {
    rounds_used: number;
    final_round_accepted: boolean;
    avg_counter_ratio?: number;
    final_counter_ratio?: number;
  };
  accepted_price?: number;
  reference_price?: number;
  band_pct?: number;
  quote_price?: number;
  max_price?: number;
  outcome: "accepted" | "rejected" | "timeout" | "failed";
  
  // Optional features
  urgent?: boolean;
  trust_tier?: "untrusted" | "low" | "trusted";
  trust_score?: number;
  wallet_can_sign_message?: boolean;
  wallet_can_sign_transaction?: boolean;
  wallet_chain?: "solana" | "evm" | "unknown";
  ml_scorer?: string;
  ml_selected_candidate_idx?: number;
  ml_top_score?: number;
};

/**
 * Convert a transcript to a training data row.
 * Returns null if the transcript cannot be converted (missing required fields).
 * 
 * This function is deterministic and safe: it strips all sensitive data
 * and converts large arrays to aggregate summaries only.
 */
export function transcriptToTrainingRow(t: TranscriptV1): TrainingRow | null {
  // Check required fields
  if (!t.intent_type || !t.input?.constraints) {
    return null;
  }

  const constraints = t.input.constraints;
  if (typeof constraints.latency_ms !== "number" || typeof constraints.freshness_sec !== "number") {
    return null;
  }

  // Extract negotiation info
  const negotiation = t.negotiation;
  if (!negotiation || !negotiation.strategy) {
    return null;
  }

  // Compute rounds summary from negotiation_rounds or negotiation.log
  let roundsUsed = negotiation.rounds_used || 0;
  let finalRoundAccepted = false;
  let avgCounterRatio: number | undefined;
  let finalCounterRatio: number | undefined;

  if (t.negotiation_rounds && t.negotiation_rounds.length > 0) {
    const rounds = t.negotiation_rounds;
    roundsUsed = rounds.length;
    const lastRound = rounds[rounds.length - 1];
    finalRoundAccepted = lastRound.accepted || false;

    // Compute average counter ratio
    const ratios: number[] = [];
    for (const round of rounds) {
      if (round.ask_price > 0) {
        ratios.push(round.counter_price / round.ask_price);
      }
    }
    if (ratios.length > 0) {
      avgCounterRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    }

    // Final counter ratio
    if (lastRound.ask_price > 0) {
      finalCounterRatio = lastRound.counter_price / lastRound.ask_price;
    }
  } else if (negotiation.log && negotiation.log.length > 0) {
    // Fallback to negotiation.log if negotiation_rounds not available
    const doneEntry = negotiation.log.find(e => e.decision.type === "done");
    if (doneEntry && "final_price" in doneEntry.decision) {
      finalRoundAccepted = true;
    }
  }

  // Extract pricing info
  const receipt = t.receipt;
  const acceptedPrice = receipt?.agreed_price;
  
  // Get reference price from quotes or explain
  let referencePrice: number | undefined;
  if (t.quotes && t.quotes.length > 0) {
    const firstQuote = t.quotes[0];
    if (firstQuote.quote_summary?.reference_price_p50 !== undefined) {
      referencePrice = firstQuote.quote_summary.reference_price_p50;
    }
  }

  // Get quote price from negotiation log or quotes
  let quotePrice: number | undefined;
  const startEntry = negotiation.log?.find(e => e.decision.type === "start");
  if (startEntry && "quote_price" in startEntry.decision) {
    quotePrice = startEntry.decision.quote_price;
  } else if (t.quotes && t.quotes.length > 0) {
    const firstQuote = t.quotes[0];
    if (firstQuote.quote_summary?.quote_price !== undefined) {
      quotePrice = firstQuote.quote_summary.quote_price;
    }
  }

  // Get max price from negotiation log
  let maxPrice: number | undefined;
  if (startEntry && "max_price" in startEntry.decision) {
    maxPrice = startEntry.decision.max_price;
  } else if (t.input.maxPrice !== undefined) {
    maxPrice = t.input.maxPrice;
  }

  // Get band_pct from negotiation params or explain
  let bandPct: number | undefined;
  if (t.input.negotiation?.params?.band_pct !== undefined) {
    bandPct = t.input.negotiation.params.band_pct as number;
  }

  // Determine outcome
  let outcome: "accepted" | "rejected" | "timeout" | "failed" = "failed";
  if (t.outcome?.ok) {
    outcome = "accepted";
  } else if (t.outcome?.code === "NEGOTIATION_FAILED") {
    const rejectedEntry = negotiation.log?.find(e => e.decision.type === "rejected");
    if (rejectedEntry) {
      outcome = "rejected";
    } else {
      outcome = "failed";
    }
  } else if (t.outcome?.code?.includes("TIMEOUT") || t.outcome?.code?.includes("timeout")) {
    outcome = "timeout";
  } else if (t.outcome?.code === "NO_ELIGIBLE_PROVIDERS" || t.outcome?.code === "QUOTE_FETCH_FAILED") {
    outcome = "rejected";
  }

  // Build base row
  const row: TrainingRow = {
    intent_type: t.intent_type,
    constraints: {
      latency_ms: constraints.latency_ms,
      freshness_sec: constraints.freshness_sec,
    },
    negotiation_strategy: negotiation.strategy,
    rounds_summary: {
      rounds_used: roundsUsed,
      final_round_accepted: finalRoundAccepted,
    },
    outcome,
  };

  // Add optional fields
  if (t.asset) {
    row.asset = t.asset;
  } else if (t.asset_id) {
    row.asset = t.asset_id;
  }

  if (t.chain) {
    row.chain = t.chain;
  } else if (t.chain_id) {
    row.chain = t.chain_id;
  }

  if (acceptedPrice !== undefined) {
    row.accepted_price = acceptedPrice;
  }

  if (referencePrice !== undefined) {
    row.reference_price = referencePrice;
  }

  if (quotePrice !== undefined) {
    row.quote_price = quotePrice;
  }

  if (maxPrice !== undefined) {
    row.max_price = maxPrice;
  }

  if (bandPct !== undefined) {
    row.band_pct = bandPct;
  }

  if (avgCounterRatio !== undefined) {
    row.rounds_summary.avg_counter_ratio = avgCounterRatio;
  }

  if (finalCounterRatio !== undefined) {
    row.rounds_summary.final_counter_ratio = finalCounterRatio;
  }

  // Optional features
  if (t.input.urgent !== undefined) {
    row.urgent = t.input.urgent;
  }

  // Trust tier from credential checks or zk_kya
  if (t.credential_checks && t.credential_checks.length > 0) {
    const firstCheck = t.credential_checks[0];
    if (firstCheck.trust_tier) {
      row.trust_tier = firstCheck.trust_tier;
    }
    if (firstCheck.trust_score !== undefined) {
      row.trust_score = firstCheck.trust_score;
    }
  } else if (t.zk_kya?.verification?.tier) {
    row.trust_tier = t.zk_kya.verification.tier;
    if (t.zk_kya.verification.trust_score !== undefined) {
      row.trust_score = t.zk_kya.verification.trust_score;
    }
  }

  // Wallet capabilities
  if (t.wallet?.capabilities) {
    row.wallet_can_sign_message = t.wallet.capabilities.can_sign_message;
    row.wallet_can_sign_transaction = t.wallet.capabilities.can_sign_transaction;
    row.wallet_chain = t.wallet.capabilities.chain;
  }

  // ML metadata
  if (negotiation.ml) {
    if (negotiation.ml.scorer) {
      row.ml_scorer = negotiation.ml.scorer;
    }
    if (negotiation.ml.selected_candidate_idx !== undefined) {
      row.ml_selected_candidate_idx = negotiation.ml.selected_candidate_idx;
    }
    if (negotiation.ml.top_scores && negotiation.ml.top_scores.length > 0) {
      row.ml_top_score = negotiation.ml.top_scores[0].score;
    }
  }

  return row;
}
