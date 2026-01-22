/**
 * Banded Concession Negotiation Strategy
 * 
 * Deterministic negotiation strategy that makes counteroffers within a price band,
 * gradually moving toward the provider's ask price across multiple rounds.
 */

import type { NegotiationStrategy } from "./strategy";
import type { NegotiationInput, NegotiationResult, NegotiationLogEntry } from "./types";

export interface BandedConcessionResult {
  counter_price: number;
  reason: string;
  within_band: boolean;
  used_override: boolean;
}

export class BandedConcessionStrategy implements NegotiationStrategy {
  async negotiate(input: NegotiationInput): Promise<NegotiationResult> {
    // Use deterministic timestamp (or Date.now() if not provided)
    const startTime = (input as any).timestamp_ms ?? Date.now();
    const log: NegotiationLogEntry[] = [];
    
    const referencePrice = input.reference_price ?? input.quote_price;
    const bandPct = input.band_pct ?? 0.1; // Default 10% band
    const maxRounds = input.max_rounds ?? 3;
    const urgent = input.urgent ?? false;
    const allowBandOverride = input.allow_band_override ?? urgent; // Allow override when urgent
    const currentRound = input.current_round ?? 0;
    
    // Compute band
    const bandLow = referencePrice * (1 - bandPct);
    const bandHigh = referencePrice * (1 + bandPct);
    
    // Clamp ask price to band (for initial calculation)
    const askClamped = Math.max(bandLow, Math.min(input.quote_price, bandHigh));
    
    // Start with buyer_target = min(ask_price, band_high) on round 0
    const buyerTarget = Math.min(input.quote_price, bandHigh);
    
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
      const counterResult = this.computeCounter(
        currentRound,
        maxRounds,
        referencePrice,
        bandPct,
        input.quote_price,
        urgent
      );
      
      const accepted = counterResult.counter_price >= input.quote_price;
      
      const roundTime = startTime + currentRound * 100;
      if (accepted) {
        log.push({
          round: currentRound,
          timestamp_ms: roundTime,
          decision: {
            type: "accepted_quote",
            price: input.quote_price,
          },
        });
      } else {
        log.push({
          round: currentRound,
          timestamp_ms: roundTime,
          decision: {
            type: "counteroffer",
            buyer_price: counterResult.counter_price,
            provider_price: input.quote_price,
          },
        });
      }
      
      if (accepted) {
        log.push({
          round: currentRound,
          timestamp_ms: roundTime + 1,
          decision: {
            type: "done",
            final_price: input.quote_price,
          },
        });
      }
      
      return {
        ok: accepted,
        agreed_price: accepted ? input.quote_price : counterResult.counter_price,
        rounds_used: currentRound,
        log,
        counter_price: counterResult.counter_price,
        within_band: counterResult.within_band,
        used_override: counterResult.used_override,
        reason: accepted ? undefined : counterResult.reason,
      };
    }
    
    // Full negotiation (all rounds)
    let roundNum = 0;
    let counterPrice = buyerTarget;
    let accepted = false;
    let usedOverride = false;
    
    while (roundNum < maxRounds && !accepted) {
      roundNum++;
      const roundTime = startTime + roundNum * 100;
      
      // Calculate counter price for this round
      const counterResult = this.computeCounter(
        roundNum,
        maxRounds,
        referencePrice,
        bandPct,
        input.quote_price,
        urgent
      );
      counterPrice = counterResult.counter_price;
      usedOverride = counterResult.used_override || usedOverride;
      
      // Accept when counter_price >= ask_price
      if (counterPrice >= input.quote_price) {
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
        // Log counteroffer
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
      // Negotiation didn't reach agreement within max rounds
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
        counter_price: counterPrice,
        within_band: counterPrice >= bandLow && counterPrice <= bandHigh,
        used_override: usedOverride,
        reason: `Negotiation did not reach agreement within ${maxRounds} rounds`,
      };
    }
    
    // Done
    const finalPrice = input.quote_price;
    log.push({
      round: roundNum,
      timestamp_ms: startTime + roundNum * 100 + 1,
      decision: {
        type: "done",
        final_price: finalPrice,
      },
    });
    
    return {
      ok: true,
      agreed_price: finalPrice,
      rounds_used: roundNum,
      log,
      counter_price: counterPrice,
      within_band: true,
      used_override: usedOverride,
    };
  }
  
  /**
   * Compute counter price for a specific round (for testing/debugging)
   */
  computeCounter(
    round: number,
    maxRounds: number,
    referencePrice: number,
    bandPct: number,
    askPrice: number,
    urgent: boolean = false
  ): BandedConcessionResult {
    const bandLow = referencePrice * (1 - bandPct);
    const bandHigh = referencePrice * (1 + bandPct);
    const askClamped = Math.max(bandLow, Math.min(askPrice, bandHigh));
    const buyerTarget = Math.min(askPrice, bandHigh);
    
    if (round === 0) {
      return {
        counter_price: buyerTarget,
        reason: "Initial buyer target",
        within_band: true,
        used_override: false,
      };
    }
    
    const progress = round / maxRounds;
    let counterPrice: number;
    let usedOverride = false;
    
    if (urgent && askPrice > bandHigh) {
      const overrideLimit = referencePrice * 0.1;
      const maxCounterWithOverride = bandHigh + overrideLimit;
      if (askPrice <= maxCounterWithOverride) {
        // Use actual askPrice (not clamped) for calculation when override is allowed
        counterPrice = bandLow + (askPrice - bandLow) * progress;
        counterPrice = Math.max(bandLow, Math.min(counterPrice, askPrice));
        usedOverride = true;
      } else {
        // Clamp to band if override limit exceeded
        counterPrice = bandLow + (askClamped - bandLow) * progress;
        counterPrice = Math.max(bandLow, Math.min(counterPrice, bandHigh));
      }
    } else {
      // Normal case: use clamped ask and clamp to band
      counterPrice = bandLow + (askClamped - bandLow) * progress;
      counterPrice = Math.max(bandLow, Math.min(counterPrice, bandHigh));
    }
    
    const withinBand = counterPrice >= bandLow && counterPrice <= bandHigh;
    
    return {
      counter_price: counterPrice,
      reason: `Round ${round} counteroffer`,
      within_band: withinBand,
      used_override: usedOverride,
    };
  }
}

