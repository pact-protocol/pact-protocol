import type { FailureCode } from "../policy/types";

export type Receipt = {
  receipt_id: string;
  intent_id: string;
  buyer_agent_id: string;
  seller_agent_id: string;
  agreed_price: number;
  fulfilled: boolean;
  latency_ms?: number;
  failure_code?: FailureCode | string;
  paid_amount?: number;
  ticks?: number;
  chunks?: number;
  timestamp_ms: number;
};

export function createReceipt(params: {
  intent_id: string;
  buyer_agent_id: string;
  seller_agent_id: string;
  agreed_price: number;
  fulfilled: boolean;
  timestamp_ms: number;
  latency_ms?: number;
  failure_code?: FailureCode | string;
  paid_amount?: number;
  ticks?: number;
  chunks?: number;
}): Receipt {
  const ts = params.timestamp_ms;
  const receiptId = "receipt-" + params.intent_id + "-" + ts;
  return {
    receipt_id: receiptId,
    intent_id: params.intent_id,
    buyer_agent_id: params.buyer_agent_id,
    seller_agent_id: params.seller_agent_id,
    agreed_price: params.agreed_price,
    fulfilled: params.fulfilled,
    latency_ms: params.latency_ms,
    failure_code: params.failure_code,
    paid_amount: params.paid_amount,
    ticks: params.ticks,
    chunks: params.chunks,
    timestamp_ms: ts,
  };
}




