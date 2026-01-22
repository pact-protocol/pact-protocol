/**
 * Streaming Exchange - Phase 4 Streaming Mode
 * 
 * Handles streaming payment and chunk delivery for Pact agreements.
 */

import type { SignedEnvelope } from "../protocol/envelope";
import type { SettlementProvider } from "../settlement/provider";
import type { CompiledPolicy } from "../policy/types";
import { createReceipt, type Receipt } from "./receipt";
import { FailureCode } from "../policy/types";

export type StreamingResult = {
  ok: true;
  receipt: Receipt;
} | {
  ok: false;
  code: FailureCode;
  reason: string;
  receipt?: Receipt;
};

export interface StreamingState {
  buyer: string;
  seller: string;
  rate_per_tick: number;
  tick_ms: number;
  paid_amount: number;
  ticks: number;
  chunks: number;
  last_tick_ms: number;
  start_ms: number;
  total_budget: number;
  status: "ACTIVE" | "STOPPED" | "COMPLETED" | "FAILED";
}

export interface StreamStartMessage {
  protocol_version: string;
  type: "STREAM_START";
  intent_id: string;
  agreed_price: number;
  tick_ms: number;
  sent_at_ms: number;
  expires_at_ms: number;
}

export interface StreamChunkMessage {
  protocol_version: string;
  type: "STREAM_CHUNK";
  intent_id: string;
  chunk_b64: string;
  seq: number;
  sent_at_ms: number;
  expires_at_ms: number;
}

export interface StreamStopMessage {
  protocol_version: string;
  type: "STREAM_STOP";
  intent_id: string;
  by: "buyer" | "seller";
  reason: string;
  sent_at_ms: number;
  expires_at_ms: number;
}

export class StreamingExchange {
  private state: StreamingState;
  private settlement: SettlementProvider;
  private policy: CompiledPolicy;
  private now: () => number;
  private intentId: string;
  private expectedSeq: number = 0;
  private paymentHistory: Array<{ amount: number; timestamp_ms: number }> = [];

  constructor(params: {
    settlement: SettlementProvider;
    policy: CompiledPolicy;
    now: () => number;
    buyerId: string;
    sellerId: string;
    intentId: string;
    totalBudget: number;
    tickMs: number;
    plannedTicks?: number;
    // v1.6.9+: Support for remaining budget (B4)
    remainingBudget?: number; // If provided, use this instead of totalBudget (for fallback)
    initialPaidAmount?: number; // If provided, start from this paid amount (for fallback)
    initialTicks?: number; // If provided, start from this tick count (for fallback)
    initialChunks?: number; // If provided, start from this chunk count (for fallback)
  }) {
    const { settlement, policy, now, buyerId, sellerId, intentId, totalBudget, tickMs, plannedTicks = 50, remainingBudget, initialPaidAmount = 0, initialTicks = 0, initialChunks = 0 } = params;
    
    this.settlement = settlement;
    this.policy = policy;
    this.now = now;
    this.intentId = intentId;
    
    // v1.6.9+: Use remainingBudget if provided (for fallback), otherwise use totalBudget (B4)
    const effectiveBudget = remainingBudget !== undefined ? remainingBudget : totalBudget;
    const ratePerTick = effectiveBudget / plannedTicks;
    
    this.state = {
      buyer: buyerId,
      seller: sellerId,
      rate_per_tick: ratePerTick,
      tick_ms: tickMs,
      paid_amount: initialPaidAmount, // v1.6.9+: Start from initial paid amount (B4)
      ticks: initialTicks, // v1.6.9+: Start from initial ticks (B4)
      chunks: initialChunks, // v1.6.9+: Start from initial chunks (B4)
      last_tick_ms: now(),
      start_ms: now(),
      total_budget: effectiveBudget, // v1.6.9+: Use effective budget (remaining or total) (B4)
      status: "ACTIVE",
    };
  }

  start(): StreamStartMessage {
    const now = this.now();
    // Allow first tick immediately by setting last_tick_ms to (now - tick_ms)
    this.state.last_tick_ms = now - this.state.tick_ms;
    this.state.status = "ACTIVE"; // Ensure status is active
    return {
      protocol_version: "1.0",
      type: "STREAM_START",
      intent_id: this.intentId,
      agreed_price: this.state.total_budget,
      tick_ms: this.state.tick_ms,
      sent_at_ms: now,
      expires_at_ms: now + 300000, // 5 min
    };
  }

  onChunk(input: SignedEnvelope<StreamChunkMessage> | StreamChunkMessage): { ok: boolean; code?: string; reason?: string } {
    if (this.state.status !== "ACTIVE") {
      return { ok: false, code: "FAILED_POLICY", reason: "Stream is not active" };
    }

    // Handle both envelope and plain message objects
    const message = (input as any)?.message ?? input as StreamChunkMessage;
    
    // Validate intent_id
    if (message.intent_id !== this.intentId) {
      return { ok: false, code: "FAILED_POLICY", reason: "Intent ID mismatch" };
    }

    // Validate sequence order
    if (message.seq !== this.expectedSeq) {
      return { 
        ok: false, 
        code: "FAILED_POLICY", 
        reason: `Invalid sequence: expected ${this.expectedSeq}, got ${message.seq}` 
      };
    }

    // Validate expiry (if provided)
    if (message.expires_at_ms != null && this.now() > message.expires_at_ms) {
      return { ok: false, code: "FAILED_NEGOTIATION_TIMEOUT", reason: "Chunk expired" };
    }

    this.state.chunks++;
    this.expectedSeq++;
    
    return { ok: true };
  }

  tick(): { ok: boolean; code?: string; reason?: string; receipt?: Receipt } {
    if (this.state.status !== "ACTIVE") {
      return { ok: false, code: "FAILED_POLICY", reason: "Stream is not active" };
    }

    const now = this.now();
    const elapsed = now - this.state.last_tick_ms;
    
    // Only tick if enough time has passed
    if (elapsed < this.state.tick_ms) {
      return { ok: true }; // Not time to tick yet
    }

    // Check if budget is exhausted
    if (this.state.paid_amount >= this.state.total_budget) {
      this.state.status = "COMPLETED";
      return {
        ok: true,
        receipt: this.createReceipt(true, null),
      };
    }

    // 1) Cap check FIRST - before attempting payment
    if (this.wouldExceedSpendCap(this.state.rate_per_tick, now)) {
      const streamingPolicy = this.policy.base?.settlement?.streaming;
      if (streamingPolicy?.cutoff_on_violation) {
        this.state.status = "FAILED";
      }
      const receipt = this.createReceipt(false, "FAILED_POLICY");
      return {
        ok: false,
        code: "FAILED_POLICY",
        reason: "Spend cap exceeded",
        receipt,
      };
    }

    // 2) Attempt payment SECOND
    const success = this.settlement.streamTick(
      this.state.buyer,
      this.state.seller,
      this.state.rate_per_tick
    );

    if (!success) {
      this.state.status = "FAILED";
      return {
        ok: false,
        code: "FAILED_ESCROW",
        reason: "Insufficient funds for stream tick",
        receipt: this.createReceipt(false, "FAILED_ESCROW"),
      };
    }

    this.state.paid_amount += this.state.rate_per_tick;
    this.state.ticks++;
    this.state.last_tick_ms = now;
    
    // Record payment for rate limiting
    this.paymentHistory.push({
      amount: this.state.rate_per_tick,
      timestamp_ms: now,
    });
    
    // Clean up old payment history (keep last 2 minutes)
    const twoMinutesAgo = now - 120000;
    this.paymentHistory = this.paymentHistory.filter(p => p.timestamp_ms >= twoMinutesAgo);

    // Check if budget is now exhausted
    if (this.state.paid_amount >= this.state.total_budget) {
      this.state.status = "COMPLETED";
      return {
        ok: true,
        receipt: this.createReceipt(true, null),
      };
    }

    return { ok: true };
  }

  stop(by: "buyer" | "seller", reason: string): Receipt {
    this.state.status = "STOPPED";
    const failureCode = by === "buyer" ? "BUYER_STOPPED" : "SELLER_STOPPED";
    return this.createReceipt(false, failureCode);
  }

  getState(): StreamingState {
    return { ...this.state };
  }

  private wouldExceedSpendCap(nextAmount: number, now: number): boolean {
    const cap = this.policy?.base?.settlement?.streaming?.max_spend_per_minute;
    if (cap == null) return false;
  
    // Deterministic "single tick exceeds cap" guard:
    // If cap is tiny (common in tests), we must fail before attempting payment,
    // otherwise streamTick will fail and return FAILED_ESCROW.
    if (nextAmount > cap) return true;
  
    // Rolling 60s window: sum past payments + next tick
    const windowStart = now - 60_000;
    const spentLastMinute = this.paymentHistory
      .filter((p) => p.timestamp_ms >= windowStart)
      .reduce((sum, p) => sum + p.amount, 0);
  
    return spentLastMinute + nextAmount > cap;
  }
    

  private createReceipt(fulfilled: boolean, failureCode: string | null): Receipt {
    const round8 = (x: number) => Math.round(x * 1e8) / 1e8;
    return createReceipt({
      intent_id: this.intentId,
      buyer_agent_id: this.state.buyer,
      seller_agent_id: this.state.seller,
      agreed_price: this.state.total_budget,
      fulfilled,
      failure_code: failureCode ?? undefined,
      paid_amount: round8(this.state.paid_amount),
      ticks: this.state.ticks,
      chunks: this.state.chunks,
      timestamp_ms: this.now(),
    });
  }
}

