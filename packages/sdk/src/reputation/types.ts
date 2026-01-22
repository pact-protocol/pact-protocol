/**
 * Reputation Layer Types
 * 
 * Defines types for agent reputation scoring and price statistics.
 */

import type { Receipt } from "../exchange/receipt";

/**
 * Agent reputation and performance metrics.
 */
export type AgentScore = {
  agent_id: string;
  reputation: number;      // 0..1
  successRate: number;     // 0..1
  failureRate: number;     // 0..1
  avgLatencyMs: number | null;
  volume: number;          // sum of value
  trades: number;
};

/**
 * Price statistics (percentiles).
 */
export type PriceStats = {
  p50: number | null;
  p90: number | null;
  n: number;
};




