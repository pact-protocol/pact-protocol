export type AgreementStatus = "LOCKED" | "COMPLETED" | "SLASHED" | "REFUNDED";

export interface Agreement {
  agreement_id: string;
  intent_id: string;
  buyer_agent_id: string;
  seller_agent_id: string;
  agreed_price: number;
  seller_bond: number;
  settlement_mode: "hash_reveal" | "streaming";
  proof_type: "hash_reveal" | "streaming";
  challenge_window_ms: number;
  delivery_deadline_ms: number;
  created_at_ms: number;
  status: AgreementStatus;
  commit_hash_hex?: string; // Set when COMMIT is received
  revealed_payload_b64?: string; // Set when REVEAL is received
  revealed_nonce_b64?: string; // Set when REVEAL is received
}

export function createAgreement(
  intentId: string,
  buyerAgentId: string,
  sellerAgentId: string,
  agreedPrice: number,
  sellerBond: number,
  challengeWindowMs: number,
  deliveryDeadlineMs: number,
  createdAtMs: number
): Agreement {
  return {
    agreement_id: `agreement-${intentId}-${createdAtMs}`,
    intent_id: intentId,
    buyer_agent_id: buyerAgentId,
    seller_agent_id: sellerAgentId,
    agreed_price: agreedPrice,
    seller_bond: sellerBond,
    settlement_mode: "hash_reveal",
    proof_type: "hash_reveal",
    challenge_window_ms: challengeWindowMs,
    delivery_deadline_ms: deliveryDeadlineMs,
    created_at_ms: createdAtMs,
    status: "LOCKED",
  };
}

