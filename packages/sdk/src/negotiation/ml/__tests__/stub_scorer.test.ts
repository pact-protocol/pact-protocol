import { describe, it, expect } from "vitest";
import { StubMLScorer } from "../stub_scorer";
import type { MLScorerInput } from "../types";

describe("StubMLScorer", () => {
  it("should rank candidates deterministically (same input => same output)", async () => {
    const scorer = new StubMLScorer();
    const input: MLScorerInput = {
      round: 1,
      quote_price: 0.0001,
      max_price: 0.0002,
      reference_price: 0.00009,
      candidates: [0.00008, 0.0001, 0.00012, 0.00015],
      urgent: false,
      intent_type: "weather.data",
      buyer_id: "buyer1",
      provider_id: "provider1",
    };

    const result1 = await scorer.score(input);
    const result2 = await scorer.score(input);
    const result3 = await scorer.score(input);

    // All results should be identical
    expect(result1.best_idx).toBe(result2.best_idx);
    expect(result2.best_idx).toBe(result3.best_idx);
    expect(result1.best_price).toBe(result2.best_price);
    expect(result2.best_price).toBe(result3.best_price);
    
    // Ranked candidates should be identical
    expect(result1.ranked_candidates.length).toBe(result2.ranked_candidates.length);
    expect(result2.ranked_candidates.length).toBe(result3.ranked_candidates.length);
    
    for (let i = 0; i < result1.ranked_candidates.length; i++) {
      expect(result1.ranked_candidates[i].idx).toBe(result2.ranked_candidates[i].idx);
      expect(result2.ranked_candidates[i].idx).toBe(result3.ranked_candidates[i].idx);
      expect(result1.ranked_candidates[i].score).toBe(result2.ranked_candidates[i].score);
      expect(result2.ranked_candidates[i].score).toBe(result3.ranked_candidates[i].score);
    }
  });

  it("should use stable tie-breaking (two equal scores => lower idx wins)", async () => {
    const scorer = new StubMLScorer();
    
    // Create candidates that might have similar scores
    // Use candidates that are all within max_price to avoid penalty differences
    const input: MLScorerInput = {
      round: 1,
      quote_price: 0.0001,
      max_price: 0.0002,
      reference_price: 0.0001, // Same as quote to create similar scoring
      candidates: [0.0001, 0.0001, 0.0001], // Same prices to force tie-breaking
      urgent: false,
      intent_type: "weather.data",
      buyer_id: "buyer1",
      provider_id: "provider1",
    };

    const result = await scorer.score(input);

    // All candidates have same price, so tie-breaking should use index
    // Lower index should win (or appear first in ranking)
    expect(result.ranked_candidates.length).toBe(3);
    
    // Verify stable ordering: indices should be in ascending order for equal scores
    // (or at least the best should be the lowest index)
    const bestCandidate = result.ranked_candidates[0];
    expect(bestCandidate.idx).toBe(0); // First candidate (lowest index) should win tie
    
    // Verify all candidates are present
    const indices = result.ranked_candidates.map(c => c.idx).sort();
    expect(indices).toEqual([0, 1, 2]);
  });

  it("should return compact explanation", async () => {
    const scorer = new StubMLScorer();
    const input: MLScorerInput = {
      round: 1,
      quote_price: 0.0001,
      max_price: 0.0002,
      reference_price: 0.00009,
      candidates: [0.00008, 0.0001, 0.00012],
      urgent: false,
      intent_type: "weather.data",
      buyer_id: "buyer1",
      provider_id: "provider1",
    };

    const result = await scorer.score(input);

    // Explanation should be present and compact
    expect(result.explanation).toBeDefined();
    expect(typeof result.explanation).toBe("string");
    expect(result.explanation!.length).toBeLessThan(500); // Compact, not huge
    
    // Explanation should mention key details
    expect(result.explanation).toContain("candidate");
    expect(result.explanation).toContain("price");
    
    // Each ranked candidate should have a reason
    expect(result.ranked_candidates.length).toBeGreaterThan(0);
    for (const candidate of result.ranked_candidates) {
      expect(candidate.reason).toBeDefined();
      expect(typeof candidate.reason).toBe("string");
      expect(candidate.reason!.length).toBeLessThan(200); // Compact reason
    }
  });

  it("should prefer candidates within max_price", async () => {
    const scorer = new StubMLScorer();
    const input: MLScorerInput = {
      round: 1,
      quote_price: 0.0001,
      max_price: 0.0001,
      reference_price: 0.00009,
      candidates: [0.00008, 0.0001, 0.00015], // Last exceeds max_price
      urgent: false,
      intent_type: "weather.data",
      buyer_id: "buyer1",
      provider_id: "provider1",
    };

    const result = await scorer.score(input);

    // Best candidate should be within max_price
    expect(result.best_price).toBeLessThanOrEqual(input.max_price);
    
    // Candidates exceeding max_price should be ranked lower
    const withinMax = result.ranked_candidates.filter(c => c.price <= input.max_price);
    const exceedsMax = result.ranked_candidates.filter(c => c.price > input.max_price);
    
    if (exceedsMax.length > 0) {
      // All within-max candidates should have higher scores than exceeds-max
      const minWithinMaxScore = Math.min(...withinMax.map(c => c.score));
      const maxExceedsMaxScore = Math.max(...exceedsMax.map(c => c.score));
      expect(minWithinMaxScore).toBeGreaterThan(maxExceedsMaxScore);
    }
  });

  it("should handle empty candidates array", async () => {
    const scorer = new StubMLScorer();
    const input: MLScorerInput = {
      round: 1,
      quote_price: 0.0001,
      max_price: 0.0002,
      candidates: [],
      urgent: false,
      intent_type: "weather.data",
      buyer_id: "buyer1",
      provider_id: "provider1",
    };

    await expect(scorer.score(input)).rejects.toThrow("candidates array cannot be empty");
  });

  it("should handle candidates with reference_price", async () => {
    const scorer = new StubMLScorer();
    const input: MLScorerInput = {
      round: 1,
      quote_price: 0.0001,
      max_price: 0.0002,
      reference_price: 0.00009,
      candidates: [0.00008, 0.00009, 0.0001, 0.00011],
      urgent: false,
      intent_type: "weather.data",
      buyer_id: "buyer1",
      provider_id: "provider1",
    };

    const result = await scorer.score(input);

    // Should prefer candidates closer to reference_price
    expect(result.ranked_candidates.length).toBe(4);
    
    // The candidate closest to reference_price (0.00009) should be ranked highly
    const closestToRef = result.ranked_candidates.find(c => c.price === 0.00009);
    expect(closestToRef).toBeDefined();
    expect(closestToRef!.score).toBeGreaterThan(0);
  });
});
