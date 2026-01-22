/**
 * ML Negotiation Strategy
 * 
 * Negotiation strategy that uses an ML scorer to evaluate and select
 * counteroffers from a set of candidates. Currently uses a deterministic
 * stub scorer, but designed to be pluggable with real ML systems.
 */

import type { NegotiationStrategy } from "./strategy";
import type { NegotiationInput, NegotiationResult, NegotiationLogEntry } from "./types";
import { StubMLScorer, type MLScorer } from "./ml";

export interface MLStrategyParams {
  /** Scorer to use (default: "stub") */
  scorer?: "stub";
  /** Number of candidate counteroffers to generate per round (default: 3) */
  candidate_count?: number;
  /** Temperature parameter (accepted but ignored for stub; kept for forward compatibility) */
  temperature?: number;
}

export class MLNegotiationStrategy implements NegotiationStrategy {
  private scorer: MLScorer;
  private candidateCount: number;
  private lastScorerOutput: { ranked_candidates: Array<{idx: number; score: number; reason?: string}>; best_idx: number } | null = null;
  
  constructor(params?: MLStrategyParams) {
    const { scorer = "stub", candidate_count = 3 } = params || {};
    
    // Initialize scorer based on type
    if (scorer === "stub") {
      this.scorer = new StubMLScorer();
    } else {
      throw new Error(`Unknown scorer type: ${scorer}`);
    }
    
    this.candidateCount = candidate_count;
  }
  
  /**
   * Generate candidate counteroffers for a given round
   */
  private generateCandidates(
    round: number,
    maxRounds: number,
    quotePrice: number,
    maxPrice: number,
    referencePrice?: number
  ): number[] {
    const candidates: number[] = [];
    const ref = referencePrice ?? quotePrice;
    
    // Generate candidates using deterministic heuristics
    // Strategy: create candidates that span from conservative to aggressive
    
    // Candidate 1: Conservative (close to max_price, but within it)
    const conservative = Math.min(maxPrice * 0.95, quotePrice * 0.9);
    candidates.push(conservative);
    
    // Candidate 2: Mid-range (between reference and quote, or midpoint)
    if (referencePrice !== undefined) {
      const midRange = ref + (quotePrice - ref) * 0.5;
      candidates.push(Math.min(midRange, maxPrice));
    } else {
      const midRange = quotePrice * 0.75;
      candidates.push(Math.min(midRange, maxPrice));
    }
    
    // Candidate 3: Aggressive (closer to quote, but still below)
    const aggressive = quotePrice * 0.85;
    candidates.push(Math.min(aggressive, maxPrice));
    
    // Add more candidates if candidate_count > 3
    for (let i = 3; i < this.candidateCount; i++) {
      // Generate candidates at different points between conservative and aggressive
      const ratio = i / (this.candidateCount + 1);
      const candidate = conservative + (aggressive - conservative) * ratio;
      candidates.push(Math.min(candidate, maxPrice));
    }
    
    // Ensure all candidates are valid (>= 0, <= maxPrice)
    return candidates
      .map(c => Math.max(0, Math.min(c, maxPrice)))
      .filter((c, idx, arr) => arr.indexOf(c) === idx) // Remove duplicates
      .sort((a, b) => a - b); // Sort ascending for deterministic ordering
  }
  
  async negotiate(input: NegotiationInput): Promise<NegotiationResult> {
    const startTime = (input as any).timestamp_ms ?? Date.now();
    const log: NegotiationLogEntry[] = [];
    
    const referencePrice = input.reference_price ?? input.quote_price;
    const maxRounds = input.max_rounds ?? 3;
    const urgent = input.urgent ?? false;
    const currentRound = input.current_round ?? 0;
    
    // Round 0: Start
    log.push({
      round: 0,
      timestamp_ms: startTime,
      decision: {
        type: "start",
        quote_price: input.quote_price,
        max_price: input.max_price,
      },
    });
    
    // Check if quote exceeds max price
    if (input.quote_price > input.max_price) {
      log.push({
        round: 0,
        timestamp_ms: startTime + 1,
        decision: {
          type: "rejected",
          reason: `Quote price ${input.quote_price} exceeds max price ${input.max_price}`,
        },
      });
      
      return {
        ok: false,
        agreed_price: input.quote_price,
        rounds_used: 0,
        log,
        reason: `Quote price exceeds max price`,
      };
    }
    
    // If current_round is specified and > 0, compute counter for that specific round
    if (currentRound > 0) {
      // Generate candidates for this round
      const candidates = this.generateCandidates(
        currentRound,
        maxRounds,
        input.quote_price,
        input.max_price,
        referencePrice
      );
      
      // Score candidates using ML scorer
      const scorerInput = {
        round: currentRound,
        quote_price: input.quote_price,
        max_price: input.max_price,
        reference_price: referencePrice,
        candidates,
        urgent,
        intent_type: input.intent_type,
        buyer_id: input.buyer_id,
        provider_id: input.provider_id,
        max_rounds: maxRounds,
        remaining_duration_ms: input.max_total_duration_ms,
      };
      
      const scorerOutput = await this.scorer.score(scorerInput);
      
      // Store scorer output for transcript metadata
      this.lastScorerOutput = {
        ranked_candidates: scorerOutput.ranked_candidates,
        best_idx: scorerOutput.best_idx,
      };
      
      // Select best candidate
      const selectedPrice = scorerOutput.best_price;
      
      // Check if selected price is acceptable (within max_price)
      if (selectedPrice > input.max_price) {
        log.push({
          round: currentRound,
          timestamp_ms: startTime + currentRound * 100,
          decision: {
            type: "rejected",
            reason: `Selected candidate price ${selectedPrice} exceeds max price ${input.max_price}`,
          },
        });
        
        return {
          ok: false,
          agreed_price: selectedPrice,
          rounds_used: currentRound,
          log,
          reason: `Selected candidate exceeds max price`,
        };
      }
      
    // Check if we should accept the quote or make a counteroffer
    // Accept if selected price is close to quote (within 5%) or if we're at max rounds
    const shouldAccept = selectedPrice >= input.quote_price * 0.95 || (currentRound >= maxRounds && selectedPrice >= input.quote_price * 0.9);
      
      const roundTime = startTime + currentRound * 100;
      if (shouldAccept) {
        log.push({
          round: currentRound,
          timestamp_ms: roundTime,
          decision: {
            type: "accepted_quote",
            price: input.quote_price,
          },
        });
        
        log.push({
          round: currentRound,
          timestamp_ms: roundTime + 1,
          decision: {
            type: "done",
            final_price: input.quote_price,
          },
        });
        
        return {
          ok: true,
          agreed_price: input.quote_price,
          rounds_used: currentRound,
          log,
        };
      } else {
        // Make counteroffer
        log.push({
          round: currentRound,
          timestamp_ms: roundTime,
          decision: {
            type: "counteroffer",
            buyer_price: selectedPrice,
            provider_price: input.quote_price,
          },
        });
        
        return {
          ok: false, // Not done yet, needs more rounds
          agreed_price: selectedPrice,
          rounds_used: currentRound,
          log,
          reason: `Counteroffer made: ${selectedPrice}`,
        };
      }
    }
    
    // Multi-round negotiation loop (if current_round not specified)
    let roundNum = 0;
    let counterPrice = input.max_price;
    let accepted = false;
    
    while (roundNum < maxRounds && !accepted) {
      roundNum++;
      const roundTime = startTime + roundNum * 100;
      
      // Generate candidates for this round
      const candidates = this.generateCandidates(
        roundNum,
        maxRounds,
        input.quote_price,
        input.max_price,
        referencePrice
      );
      
      // Score candidates using ML scorer
      const scorerInput = {
        round: roundNum,
        quote_price: input.quote_price,
        max_price: input.max_price,
        reference_price: referencePrice,
        candidates,
        urgent,
        intent_type: input.intent_type,
        buyer_id: input.buyer_id,
        provider_id: input.provider_id,
        max_rounds: maxRounds,
        remaining_duration_ms: input.max_total_duration_ms,
      };
      
      const scorerOutput = await this.scorer.score(scorerInput);
      
      // Store scorer output for transcript metadata
      this.lastScorerOutput = {
        ranked_candidates: scorerOutput.ranked_candidates,
        best_idx: scorerOutput.best_idx,
      };
      
      counterPrice = scorerOutput.best_price;
      
      // Check if we should accept the quote or make a counteroffer
      // Accept if counter is close to quote (within 5%) or if we're at max rounds
      const shouldAccept = counterPrice >= input.quote_price * 0.95 || (roundNum >= maxRounds && counterPrice >= input.quote_price * 0.9);
      
      if (shouldAccept) {
        accepted = true;
        log.push({
          round: roundNum,
          timestamp_ms: roundTime,
          decision: {
            type: "accepted_quote",
            price: input.quote_price,
          },
        });
      } else {
        log.push({
          round: roundNum,
          timestamp_ms: roundTime,
          decision: {
            type: "counteroffer",
            buyer_price: counterPrice,
            provider_price: input.quote_price,
          },
        });
      }
    }
    
    if (!accepted) {
      log.push({
        round: roundNum,
        timestamp_ms: startTime + roundNum * 100,
        decision: {
          type: "rejected",
          reason: `Negotiation did not reach agreement within ${maxRounds} rounds`,
        },
      });
      
      return {
        ok: false,
        agreed_price: counterPrice,
        rounds_used: roundNum,
        log,
        reason: `Negotiation did not reach agreement within ${maxRounds} rounds`,
      };
    }
    
    // Done
    log.push({
      round: roundNum,
      timestamp_ms: startTime + roundNum * 100 + 1,
      decision: {
        type: "done",
        final_price: input.quote_price,
      },
    });
    
    return {
      ok: true,
      agreed_price: input.quote_price,
      rounds_used: roundNum,
      log,
    };
  }
  
  /**
   * Get ML scoring metadata for transcript
   */
  getMLMetadata(): {
    scorer: string;
    selected_candidate_idx: number;
    top_scores: Array<{idx: number; score: number; reason?: string}>;
  } | null {
    if (!this.lastScorerOutput) {
      return null;
    }
    
    return {
      scorer: "stub",
      selected_candidate_idx: this.lastScorerOutput.best_idx,
      top_scores: this.lastScorerOutput.ranked_candidates.slice(0, 3).map(c => ({
        idx: c.idx,
        score: c.score,
        reason: c.reason,
      })),
    };
  }
}
