/**
 * Test Kit (v2 improvement E)
 * 
 * Test utilities and adapters for deterministic testing.
 * Not exported in main package - use @pact/sdk/testkit or import directly.
 * 
 * This module provides test-only utilities that should not be used in production code.
 */

// Test wallet adapter (imported dynamically to avoid issues if file doesn't exist)
// Users should import directly: import { TestWalletAdapter } from "@pact/sdk/testkit"
export { TestWalletAdapter } from "../wallets/__tests__/test-adapter";

// Re-export test verifier
export { createTestZkKyaVerifier } from "../kya/zk/verifier";

// Test settlement providers
export { MockSettlementProvider } from "../settlement/mock";

// ML negotiation scorer (Phase 6)
export { StubMLScorer } from "../negotiation/ml/stub_scorer";
export type { MLScorer, MLScorerInput, MLScorerOutput } from "../negotiation/ml/types";
