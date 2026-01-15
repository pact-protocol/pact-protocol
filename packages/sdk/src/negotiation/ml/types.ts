/**
 * ML Negotiation Scorer Types
 * 
 * Types for ML-based negotiation scoring. This is a pluggable interface
 * that allows external ML systems to be integrated in the future.
 * For now, we provide a deterministic stub scorer.
 */

/**
 * Input to the ML scorer for evaluating candidate offers
 */
export interface MLScorerInput {
  /** Current round number (1-indexed) */
  round: number;
  /** Provider's quote price */
  quote_price: number;
  /** Buyer's maximum price */
  max_price: number;
  /** Optional reference price (e.g., P50 from history) */
  reference_price?: number;
  /** Array of candidate counteroffer prices to evaluate */
  candidates: number[];
  /** Whether this is an urgent request */
  urgent?: boolean;
  /** Intent type */
  intent_type: string;
  /** Buyer ID */
  buyer_id: string;
  /** Provider ID */
  provider_id: string;
  /** Maximum rounds allowed */
  max_rounds?: number;
  /** Remaining duration in milliseconds */
  remaining_duration_ms?: number;
}

/**
 * Output from the ML scorer
 */
export interface MLScorerOutput {
  /** Ranked list of candidates with scores (best first) */
  ranked_candidates: Array<{
    /** Index in original candidates array */
    idx: number;
    /** Candidate price */
    price: number;
    /** Score (higher is better) */
    score: number;
    /** Optional explanation for this score */
    reason?: string;
  }>;
  /** Index of the best candidate (from original array) */
  best_idx: number;
  /** Best candidate price */
  best_price: number;
  /** Overall explanation for the scoring */
  explanation?: string;
}

/**
 * ML Scorer Interface
 * 
 * Pluggable interface for scoring negotiation candidates.
 * Implementations must be deterministic for transcript replay.
 */
export interface MLScorer {
  /**
   * Score a set of candidate offers and return ranked results.
   * 
   * @param input - Scoring input with candidates and context
   * @returns Promise resolving to scored and ranked candidates
   */
  score(input: MLScorerInput): Promise<MLScorerOutput>;
}
