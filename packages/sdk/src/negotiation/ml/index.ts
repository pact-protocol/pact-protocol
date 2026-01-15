/**
 * ML Negotiation Module
 * 
 * Provides ML-based negotiation scoring and strategy.
 * Currently includes a deterministic stub scorer for development.
 */

export type { MLScorer, MLScorerInput, MLScorerOutput } from "./types";
export { StubMLScorer } from "./stub_scorer";
