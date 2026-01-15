/**
 * Stub ML Scorer
 * 
 * Deterministic stub implementation of MLScorer for testing and development.
 * This scorer uses simple heuristics to rank candidates without any randomness.
 * 
 * Scoring logic:
 * - Prefers prices closer to reference_price (if available)
 * - Prefers prices within max_price
 * - Prefers lower prices (better for buyer)
 * - Uses stable tie-breaking (by price, then by index)
 */

import type { MLScorer, MLScorerInput, MLScorerOutput } from "./types";

export class StubMLScorer implements MLScorer {
  async score(input: MLScorerInput): Promise<MLScorerOutput> {
    const { candidates, quote_price, max_price, reference_price, urgent } = input;
    
    if (candidates.length === 0) {
      throw new Error("StubMLScorer: candidates array cannot be empty");
    }
    
    // Score each candidate using deterministic heuristics
    const scored = candidates.map((price, idx) => {
      let score = 0;
      const reasons: string[] = [];
      
      // Base score: prefer prices within max_price
      if (price <= max_price) {
        score += 100;
        reasons.push("within_max");
      } else {
        score -= 1000; // Heavy penalty for exceeding max
        reasons.push("exceeds_max");
      }
      
      // Prefer prices closer to reference_price (if available)
      if (reference_price !== undefined) {
        const distanceFromReference = Math.abs(price - reference_price);
        const maxDistance = Math.max(reference_price, quote_price, max_price);
        const proximityScore = (1 - distanceFromReference / maxDistance) * 50;
        score += proximityScore;
        reasons.push(`proximity_to_ref:${proximityScore.toFixed(2)}`);
      }
      
      // Prefer lower prices (better for buyer), but not too low
      // If we have a reference, prefer prices between reference and quote
      if (reference_price !== undefined) {
        if (price >= reference_price && price <= quote_price) {
          score += 30;
          reasons.push("between_ref_and_quote");
        } else if (price < reference_price) {
          // Too low might be unrealistic
          score += 10;
          reasons.push("below_reference");
        }
      } else {
        // Without reference, prefer prices closer to midpoint of (0, quote_price)
        const midpoint = quote_price / 2;
        const distanceFromMidpoint = Math.abs(price - midpoint);
        const midpointScore = (1 - distanceFromMidpoint / quote_price) * 20;
        score += midpointScore;
        reasons.push(`proximity_to_midpoint:${midpointScore.toFixed(2)}`);
      }
      
      // Urgent requests: slightly prefer higher prices (faster acceptance)
      if (urgent && price >= quote_price * 0.9) {
        score += 15;
        reasons.push("urgent_high_price");
      }
      
      // Prefer prices that are reasonable fractions of quote_price
      const ratio = price / quote_price;
      if (ratio >= 0.8 && ratio <= 1.0) {
        score += 20;
        reasons.push("reasonable_ratio");
      } else if (ratio < 0.5) {
        score -= 50; // Penalize very low prices
        reasons.push("too_low_ratio");
      }
      
      return {
        idx,
        price,
        score,
        reason: reasons.join("; "),
      };
    });
    
    // Sort by score (descending), then by price (ascending for tie-breaking), then by index (ascending)
    scored.sort((a, b) => {
      if (Math.abs(a.score - b.score) > 0.01) {
        return b.score - a.score; // Higher score first
      }
      if (Math.abs(a.price - b.price) > 0.0001) {
        return a.price - b.price; // Lower price first (tie-break)
      }
      return a.idx - b.idx; // Lower index first (stable tie-break)
    });
    
    const best = scored[0];
    
    return {
      ranked_candidates: scored,
      best_idx: best.idx,
      best_price: best.price,
      explanation: `Selected candidate ${best.idx} (price: ${best.price.toFixed(6)}) with score ${best.score.toFixed(2)}. Top reason: ${best.reason?.split(";")[0] || "unknown"}`,
    };
  }
}
