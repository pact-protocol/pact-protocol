// Types mirroring provider-adapter for HTTP communication
// Duplicated here to avoid circular dependencies

import type { SignedEnvelope } from "../../protocol/envelope";

export interface ProviderQuoteRequest {
  intent_id: string;
  intent_type: string;
  max_price: number;
  constraints: {
    latency_ms: number;
    freshness_sec: number;
  };
  urgent?: boolean;
}

export interface ProviderQuoteResponse {
  envelope: SignedEnvelope; // Signed ASK envelope (preferred)
  // Legacy format for backward compatibility
  ask?: {
    price: number;
    unit: "request";
    latency_ms: number;
    valid_for_ms: number;
    bond_required: number;
  };
}

export interface CommitRequest {
  intent_id: string;
  payload_b64: string;
  nonce_b64: string;
}

export interface CommitResponse {
  envelope: SignedEnvelope; // Signed COMMIT envelope
}

export interface RevealRequest {
  intent_id: string;
  payload_b64: string;
  nonce_b64: string;
  commit_hash_hex: string;
}

export interface RevealResponse {
  envelope: SignedEnvelope; // Signed REVEAL envelope
  ok: boolean;
  code?: "FAILED_PROOF";
  reason?: string;
}

export interface StreamChunkRequest {
  intent_id: string;
  seq: number;
  sent_at_ms?: number;
}

export interface StreamChunkResponse {
  envelope: SignedEnvelope; // Signed STREAM_CHUNK envelope
}

