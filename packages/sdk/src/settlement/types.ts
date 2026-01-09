export interface SettlementAccount {
  agent_id: string;
  balance: number;
  locked: number;
}

export interface Escrow {
  id: string;
  buyer: string;
  seller: string;
  amount: number;
  bond: number;
}

// Settlement lifecycle types (v1.6.1+)
export interface SettlementIntent {
  intent_id: string;
  from: string;
  to: string;
  amount: number;
  mode: "hash_reveal" | "streaming";
  meta?: Record<string, unknown>;
  idempotency_key?: string; // Optional idempotency key for retries
}

export interface SettlementHandle {
  handle_id: string;
  intent_id: string;
  status: "prepared" | "committed" | "aborted";
  locked_amount: number;
  created_at_ms: number;
  meta?: Record<string, unknown>;
}

export interface SettlementResult {
  ok: boolean;
  status: "prepared" | "committed" | "aborted";
  paid_amount: number;
  handle_id: string;
  meta?: Record<string, unknown>;
}

