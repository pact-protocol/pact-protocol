import type { FailureCode } from "../policy/types";
import type { AssetId, ChainId } from "../assets/types";

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
  // Asset metadata (v2.2+)
  asset_id?: AssetId; // Defaults to "USDC" if omitted (backward compatible)
  chain_id?: ChainId;
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
  asset_id?: AssetId; // v2.2+
  chain_id?: ChainId; // v2.2+
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
    asset_id: params.asset_id,
    chain_id: params.chain_id,
  };
}




