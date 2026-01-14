import { describe, it, expect } from "vitest";
import { BandedConcessionStrategy } from "../banded_concession";
import type { NegotiationInput } from "../types";

describe("BandedConcessionStrategy", () => {
  it("should keep counter within band", async () => {
    const strategy = new BandedConcessionStrategy();
    // Use ask price within band to ensure acceptance
    const input: NegotiationInput = {
      intent_type: "weather.data",
      buyer_id: "buyer1",
      provider_id: "provider1",
      reference_price: 0.0001,
      quote_price: 0.00011, // Within band [0.00009, 0.00011]
      max_price: 0.0002,
      band_pct: 0.1, // 10% band
      max_rounds: 3,
    };

    const result = await strategy.negotiate(input);

    expect(result.ok).toBe(true);
    expect(result.counter_price).toBeDefined();
    
    // Check that counter stays within band [0.00009, 0.00011]
    const bandLow = 0.0001 * 0.9; // 0.00009
    const bandHigh = 0.0001 * 1.1; // 0.00011
    
    // Counter should be within band (or equal to ask if ask is within band)
    expect(result.counter_price!).toBeGreaterThanOrEqual(bandLow);
    expect(result.counter_price!).toBeLessThanOrEqual(bandHigh);
    expect(result.within_band).toBe(true);
  });

  it("should move monotonically toward ask across rounds", async () => {
    const strategy = new BandedConcessionStrategy();
    const referencePrice = 0.0001;
    const askPrice = 0.00011; // Within band
    const bandPct = 0.1;
    
    // Test round 1
    const round1Input: NegotiationInput = {
      intent_type: "weather.data",
      buyer_id: "buyer1",
      provider_id: "provider1",
      reference_price: referencePrice,
      quote_price: askPrice,
      max_price: 0.0002,
      band_pct: bandPct,
      max_rounds: 3,
      current_round: 1,
    };
    
    const round1Result = await strategy.negotiate(round1Input);
    const round1Counter = round1Result.counter_price!;
    
    // Test round 2
    const round2Input: NegotiationInput = {
      ...round1Input,
      current_round: 2,
    };
    
    const round2Result = await strategy.negotiate(round2Input);
    const round2Counter = round2Result.counter_price!;
    
    // Test round 3
    const round3Input: NegotiationInput = {
      ...round1Input,
      current_round: 3,
    };
    
    const round3Result = await strategy.negotiate(round3Input);
    const round3Counter = round3Result.counter_price!;
    
    // Counters should be monotonically increasing toward ask
    expect(round1Counter).toBeLessThanOrEqual(round2Counter);
    expect(round2Counter).toBeLessThanOrEqual(round3Counter);
    expect(round3Counter).toBeLessThanOrEqual(askPrice);
  });

  it("should use urgent override when enabled and ask exceeds band", async () => {
    const strategy = new BandedConcessionStrategy();
    const referencePrice = 0.0001;
    const askPrice = 0.00012; // Exceeds band high (0.00011) but within +10% override
    const bandPct = 0.1;
    
    // With urgent override, should be able to accept ask that's within +10% of ref
    const overrideLimit = referencePrice * 0.1; // 0.00001
    const maxWithOverride = referencePrice * 1.1 + overrideLimit; // 0.00012
    
    expect(askPrice).toBeLessThanOrEqual(maxWithOverride); // Verify test setup
    
    const input: NegotiationInput = {
      intent_type: "weather.data",
      buyer_id: "buyer1",
      provider_id: "provider1",
      reference_price: referencePrice,
      quote_price: askPrice,
      max_price: 0.0002,
      band_pct: bandPct,
      max_rounds: 3,
      urgent: true,
      allow_band_override: true,
      current_round: 3, // Final round - counter should reach ask with override
    };

    const result = await strategy.negotiate(input);

    // Should accept with override
    expect(result.ok).toBe(true);
    expect(result.used_override).toBe(true);
    expect(result.agreed_price).toBe(askPrice);
  });

  it("should reject when quote exceeds max price", async () => {
    const strategy = new BandedConcessionStrategy();
    const input: NegotiationInput = {
      intent_type: "weather.data",
      buyer_id: "buyer1",
      provider_id: "provider1",
      reference_price: 0.0001,
      quote_price: 0.0003,
      max_price: 0.0002,
      band_pct: 0.1,
      max_rounds: 3,
    };

    const result = await strategy.negotiate(input);

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("exceeds max price");
  });

  it("should compute counter correctly for round 0", () => {
    const strategy = new BandedConcessionStrategy();
    const result = strategy.computeCounter(0, 3, 0.0001, 0.1, 0.00011, false);
    
    expect(result.counter_price).toBe(0.00011); // min(ask, band_high)
    expect(result.within_band).toBe(true);
    expect(result.used_override).toBe(false);
  });

  it("should compute counter correctly for intermediate rounds", () => {
    const strategy = new BandedConcessionStrategy();
    const referencePrice = 0.0001;
    const bandPct = 0.1;
    const askPrice = 0.00011;
    const maxRounds = 3;
    
    const round1 = strategy.computeCounter(1, maxRounds, referencePrice, bandPct, askPrice, false);
    const round2 = strategy.computeCounter(2, maxRounds, referencePrice, bandPct, askPrice, false);
    const round3 = strategy.computeCounter(3, maxRounds, referencePrice, bandPct, askPrice, false);
    
    // Should progress toward ask
    expect(round1.counter_price).toBeLessThanOrEqual(round2.counter_price);
    expect(round2.counter_price).toBeLessThanOrEqual(round3.counter_price);
    expect(round3.counter_price).toBeLessThanOrEqual(askPrice);
    
    // All should be within band
    expect(round1.within_band).toBe(true);
    expect(round2.within_band).toBe(true);
    expect(round3.within_band).toBe(true);
  });
});

