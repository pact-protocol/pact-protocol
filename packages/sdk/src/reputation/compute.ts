/**
 * Reputation Computation Functions
 * 
 * Functions to compute receipt values, price statistics, and agent scores.
 */

import type { Receipt } from "../exchange/receipt";
import type { AgentScore, PriceStats } from "./types";

/**
 * Extract value from a receipt.
 * Uses paid_amount if present, otherwise agreed_price.
 */
export function receiptValue(r: Receipt | any): number {
    const paid = Number((r as any).paid_amount);
    if (Number.isFinite(paid) && paid > 0) return paid;
  
    const agreed = Number((r as any).agreed_price);
    if (Number.isFinite(agreed) && agreed > 0) return agreed;
  
    return 0;
  }  

/**
 * Compute price statistics (p50, p90) from receipts.
 */
export function priceStats(receipts: (Receipt | any)[]): PriceStats {
  if (receipts.length === 0) {
    return { p50: null, p90: null, n: 0 };
  }

  const values = receipts.map(receiptValue).filter((v) => v > 0).sort((a, b) => a - b);

  if (values.length === 0) {
    return { p50: null, p90: null, n: receipts.length };
  }

  // Use (n-1) * percentile for proper percentile calculation
  // This gives index 4 for p50 with 10 values (lower median)
  const p50Index = Math.floor((values.length - 1) * 0.5);
  const p90Index = Math.floor((values.length - 1) * 0.9);

  return {
    p50: values[p50Index] ?? null,
    p90: values[p90Index] ?? null,
    n: values.length,
  };
}

/**
 * Compute reference price p50 for a specific intent type.
 */
export function referencePriceP50(
  intentType: string,
  receipts: (Receipt | any)[],
  lookback: number = 200
): number | null {
  const filtered = receipts
    .filter((r) => (r as any).intent_type === intentType)
    .slice(-lookback);

  if (filtered.length === 0) {
    return null;
  }

  const stats = priceStats(filtered);
  return stats.p50;
}

/**
 * Compute agent score from receipts.
 */
export function agentScore(
  agentId: string,
  receipts: (Receipt | any)[],
  opts?: { minEconomicSubstance?: number }
): AgentScore {
  const minEconomicSubstance = opts?.minEconomicSubstance ?? 0.00001;

  // Filter receipts where agent is buyer or seller
  const relevant = receipts.filter(
    (r) => r.buyer_agent_id === agentId || r.seller_agent_id === agentId
  );

  // Apply economic substance filter - only for volume and reputation weighting
  const substantial = relevant.filter((r) => receiptValue(r) >= minEconomicSubstance);
  
  // Count ALL trades (including tiny ones) for trade count and success/failure rates
  const trades = relevant.length;
  
  if (trades === 0) {
    return {
      agent_id: agentId,
      reputation: 0.5, // Default neutral
      successRate: 0,
      failureRate: 0,
      avgLatencyMs: null,
      volume: 0,
      trades: 0,
    };
  }

  // Compute success/failure rates from ALL relevant receipts
  // Exclude BUYER_STOPPED from failed count (it's a normal partial execution, not seller fraud)
  const successful = relevant.filter((r) => r.fulfilled === true);
  const failed = relevant.filter(
    (r) => r.fulfilled === false && (r as any).failure_code !== "BUYER_STOPPED"
  );

  const successRate = successful.length / trades;
  const failureRate = failed.length / trades;

  // Compute volume from substantial receipts only
  const volume = substantial.reduce((sum, r) => sum + receiptValue(r), 0);

  // Compute average latency from substantial receipts
  const latencies = substantial
    .map((r) => r.latency_ms)
    .filter((ms): ms is number => typeof ms === "number" && ms > 0);

  const avgLatencyMs = latencies.length > 0
    ? latencies.reduce((sum, ms) => sum + ms, 0) / latencies.length
    : null;

  // Clique dampening: check counterparty concentration (from substantial receipts)
  const counterpartyCounts = new Map<string, number>();
  for (const r of substantial) {
    const counterparty = r.buyer_agent_id === agentId
      ? r.seller_agent_id
      : r.buyer_agent_id;
    counterpartyCounts.set(counterparty, (counterpartyCounts.get(counterparty) ?? 0) + 1);
  }

  const maxCounterpartyCount = Math.max(...Array.from(counterpartyCounts.values()), 0);
  const concentration = substantial.length > 0 ? maxCounterpartyCount / substantial.length : 0;

  // Reputation calculation (using substantial receipts for weighting):
  // 1. Base: 0.2 + 0.8 * successRate (successRate computed from all relevant)
  let reputation = 0.2 + 0.8 * successRate;

  // 2. Apply failure penalty: base * (1 - 0.5 * failureRate)
  reputation = reputation * (1 - 0.5 * failureRate);

  // 3. Apply clique dampening if concentration > 0.6 (from substantial receipts)
  if (substantial.length >= 5 && concentration > 0.6) {
    reputation *= 0.5;
  }  

  // 4. Clamp to [0, 1]
  reputation = Math.max(0, Math.min(1, reputation));

  return {
    agent_id: agentId,
    reputation,
    successRate,
    failureRate,
    avgLatencyMs,
    volume,
    trades, // Now counts ALL relevant receipts, including tiny ones
  };
}

