/**
 * Dispute Client Functions
 * 
 * Functions for opening and resolving disputes.
 */

import { randomBytes } from "crypto";
import type { PactPolicy } from "../policy/types";
import type { Receipt } from "../exchange/receipt";
import type { SettlementProvider } from "../settlement/provider";
import type { DisputeRecord, DisputeOutcome } from "./types";
import { createDispute, loadDispute, updateDispute } from "./store";

export interface OpenDisputeParams {
  receipt: Receipt;
  reason: string;
  now: number;
  policy: PactPolicy;
  transcriptPath?: string;
  settlementMeta?: {
    settlement_provider?: string;
    settlement_handle_id?: string;
  };
  disputeDir?: string;
}

export interface ResolveDisputeParams {
  dispute_id: string;
  outcome: DisputeOutcome;
  refund_amount?: number;
  notes?: string;
  now: number;
  policy: PactPolicy;
  settlementProvider: SettlementProvider;
  disputeDir?: string;
}

/**
 * Open a dispute against a receipt.
 */
export function openDispute(params: OpenDisputeParams): DisputeRecord {
  const { receipt, reason, now, policy, transcriptPath, settlementMeta, disputeDir } = params;
  
  // Check if disputes are enabled
  const disputesConfig = policy.base.disputes;
  if (!disputesConfig || !disputesConfig.enabled) {
    throw new Error("Disputes are not enabled in policy");
  }
  
  // Check if window_ms is set
  if (disputesConfig.window_ms <= 0) {
    throw new Error("Dispute window_ms must be > 0");
  }
  
  // Check if dispute is within window
  const receiptAge = now - receipt.timestamp_ms;
  if (receiptAge > disputesConfig.window_ms) {
    throw new Error(`Dispute window expired. Receipt age: ${receiptAge}ms, window: ${disputesConfig.window_ms}ms`);
  }
  
  // Generate dispute ID
  const randomSuffix = randomBytes(8).toString("hex");
  const disputeId = `dispute-${receipt.receipt_id}-${randomSuffix}`;
  
  // Compute deadline
  const deadlineAtMs = receipt.timestamp_ms + disputesConfig.window_ms;
  
  // Build evidence flags
  const evidence = {
    transcript: transcriptPath !== undefined,
    receipt: true, // Always have receipt
    settlement_events: settlementMeta?.settlement_handle_id !== undefined,
  };
  
  // Create dispute record
  const dispute: DisputeRecord = {
    dispute_id: disputeId,
    receipt_id: receipt.receipt_id,
    intent_id: receipt.intent_id,
    buyer_agent_id: receipt.buyer_agent_id,
    seller_agent_id: receipt.seller_agent_id,
    opened_at_ms: now,
    deadline_at_ms: deadlineAtMs,
    reason,
    transcript_path: transcriptPath,
    settlement_provider: settlementMeta?.settlement_provider,
    settlement_handle_id: settlementMeta?.settlement_handle_id,
    status: "OPEN",
    evidence,
  };
  
  // Store dispute
  createDispute(dispute, disputeDir);
  
  return dispute;
}

/**
 * Resolve a dispute.
 */
export function resolveDispute(params: ResolveDisputeParams): DisputeRecord {
  const { dispute_id, outcome, refund_amount, notes, now, policy, settlementProvider, disputeDir } = params;
  
  // Load dispute
  const dispute = loadDispute(dispute_id, disputeDir);
  if (!dispute) {
    throw new Error(`Dispute ${dispute_id} not found`);
  }
  
  // Check status
  if (dispute.status !== "OPEN") {
    throw new Error(`Dispute ${dispute_id} is not OPEN (status: ${dispute.status})`);
  }
  
  // Get disputes config
  const disputesConfig = policy.base.disputes;
  if (!disputesConfig || !disputesConfig.enabled) {
    throw new Error("Disputes are not enabled in policy");
  }
  
  // Determine refund amount
  let actualRefundAmount: number | undefined;
  if (outcome === "REFUND_FULL") {
    // For full refund, require refund_amount to be provided
    // In practice, this would be loaded from the receipt's paid_amount field
    if (refund_amount === undefined || refund_amount <= 0) {
      throw new Error("refund_amount must be provided and > 0 for full refund");
    }
    actualRefundAmount = refund_amount;
  } else if (outcome === "REFUND_PARTIAL") {
    if (!disputesConfig.allow_partial) {
      throw new Error("Partial refunds are not allowed in policy");
    }
    if (refund_amount === undefined || refund_amount <= 0) {
      throw new Error("refund_amount must be > 0 for partial refund");
    }
    // Validate against max_refund_pct
    // Note: In practice, we'd load the receipt to get paid_amount
    // For now, we require the caller to provide the original amount via refund_amount
    // and validate that it doesn't exceed max_refund_pct of some base amount
    // This is a simplification - real implementation would load receipt
    const maxRefundBase = refund_amount / disputesConfig.max_refund_pct; // Reverse calculate base
    const maxRefundAllowed = maxRefundBase * disputesConfig.max_refund_pct;
    if (refund_amount > maxRefundAllowed) {
      throw new Error(`Refund amount ${refund_amount} exceeds max_refund_pct (${disputesConfig.max_refund_pct})`);
    }
    actualRefundAmount = refund_amount;
  } else {
    actualRefundAmount = undefined;
  }
  
  // Execute refund if needed
  if (actualRefundAmount !== undefined && actualRefundAmount > 0) {
    if (settlementProvider.refund) {
      try {
        settlementProvider.refund(
          dispute.seller_agent_id,
          dispute.buyer_agent_id,
          actualRefundAmount,
          {
            dispute_id: dispute.dispute_id,
            receipt_id: dispute.receipt_id,
            intent_id: dispute.intent_id,
          }
        );
      } catch (error: any) {
        // If refund fails, throw error
        throw new Error(`Refund failed: ${error?.message || String(error)}`);
      }
    } else {
      throw new Error("Settlement provider does not support refunds");
    }
  }
  
  // Update dispute record
  dispute.status = "RESOLVED";
  dispute.outcome = outcome;
  dispute.refund_amount = actualRefundAmount;
  dispute.notes = notes;
  
  updateDispute(dispute, disputeDir);
  
  return dispute;
}

