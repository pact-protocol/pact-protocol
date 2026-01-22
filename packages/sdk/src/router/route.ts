import type { ExecutionPlan, Regime } from "./types";
import type { SettlementMode } from "../protocol/types";

export function routeExecution(input: {
  intentType: string;
  urgency: boolean;
  // market stats from receipts
  tradeCount: number;      // n
  p50: number | null;
  p90: number | null;
  // policy knobs (optional)
  policyMaxRounds: number;
}): ExecutionPlan {
  const { intentType, urgency, tradeCount, p50, p90, policyMaxRounds } = input;

  // 1) Determine regime by history depth + dispersion
  let regime: Regime;
  let fanout: number;
  let maxRounds: number;
  let regimeReason: string;

  if (tradeCount >= 20 && p50 !== null && p90 !== null && (p90 / p50) <= 1.2) {
    regime = "posted";
    fanout = 3;
    maxRounds = 0;
    regimeReason = "posted: deep history + low dispersion";
  } else if (tradeCount >= 5) {
    regime = "negotiated";
    fanout = 5;
    maxRounds = 1;
    regimeReason = "negotiated: medium history";
  } else {
    regime = "bespoke";
    fanout = 1;
    maxRounds = policyMaxRounds;
    regimeReason = "bespoke: sparse history";
  }

  // 2) Determine settlement mode
  const intentLower = intentType.toLowerCase();
  const hasStreamingKeywords = 
    intentLower.includes("compute") || 
    intentLower.includes("stream") || 
    intentLower.includes("inference");

  const settlement: SettlementMode = (hasStreamingKeywords || urgency) 
    ? "streaming" 
    : "hash_reveal";

  const settlementReason = settlement === "streaming"
    ? (hasStreamingKeywords ? "streaming: compute/stream/inference intent" : "streaming: urgent")
    : "hash_reveal: standard data delivery";

  // 3) Combine reasons
  const reason = `${regimeReason}; ${settlementReason}`;

  return {
    regime,
    settlement,
    fanout,
    maxRounds,
    reason,
  };
}


