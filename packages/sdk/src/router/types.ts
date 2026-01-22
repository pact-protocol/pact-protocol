import type { SettlementMode } from "../protocol/types";

export type Regime = "posted" | "negotiated" | "bespoke";
export type { SettlementMode };

export type ExecutionPlan = {
  regime: Regime;
  settlement: SettlementMode;
  fanout: number;      // number of sellers to query
  maxRounds: number;   // negotiation rounds allowed
  reason: string;      // short explanation string (for demo/logs)
};


