/**
 * Dispute Types
 * 
 * Types for dispute management in PACT.
 */

export type DisputeStatus = "OPEN" | "RESOLVED" | "REJECTED";

export type DisputeOutcome = "NO_REFUND" | "REFUND_FULL" | "REFUND_PARTIAL";

export interface DisputeRecord {
  dispute_id: string;
  receipt_id: string;
  intent_id: string;
  buyer_agent_id: string;
  seller_agent_id: string;
  opened_at_ms: number;
  deadline_at_ms: number;
  reason: string;
  transcript_path?: string;
  settlement_provider?: string;
  settlement_handle_id?: string;
  status: DisputeStatus;
  outcome?: DisputeOutcome;
  refund_amount?: number;
  notes?: string;
  evidence: {
    transcript?: boolean;
    receipt?: boolean;
    settlement_events?: boolean;
  };
}

