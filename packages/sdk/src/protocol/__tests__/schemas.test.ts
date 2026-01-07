import { describe, it, expect } from "vitest";
import {
  parseMessage,
  intentSchema,
  askSchema,
  bidSchema,
  acceptSchema,
  rejectSchema,
  commitSchema,
  revealSchema,
  receiptSchema,
} from "../schemas";

describe("INTENT message", () => {
  it("should validate a valid INTENT message", () => {
    const message = {
      protocol_version: "pact/1.0",
      type: "INTENT",
      intent_id: "test-intent-123",
      intent: "weather.data",
      scope: "NYC",
      constraints: {
        latency_ms: 50,
        freshness_sec: 10,
      },
      max_price: 0.0001,
      settlement_mode: "streaming",
      urgent: false,
      sent_at_ms: 1000,
      expires_at_ms: 2000,
    };

    const result = intentSchema.parse(message);
    expect(result.type).toBe("INTENT");
    expect(result.intent_id).toBe("test-intent-123");
  });

  it("should reject INTENT with expires_at_ms <= sent_at_ms", () => {
    const message = {
      protocol_version: "pact/1.0",
      type: "INTENT",
      intent_id: "test-intent-123",
      intent: "weather.data",
      scope: "NYC",
      constraints: {
        latency_ms: 50,
        freshness_sec: 10,
      },
      max_price: 0.0001,
      settlement_mode: "streaming",
      sent_at_ms: 1000,
      expires_at_ms: 1000, // Same as sent_at_ms, should fail
    };

    expect(() => intentSchema.parse(message)).toThrow();
  });

  it("should accept scope as object", () => {
    const message = {
      protocol_version: "pact/1.0",
      type: "INTENT",
      intent_id: "test-intent-123",
      intent: "weather.data",
      scope: { region: "NYC", type: "forecast" },
      constraints: {
        latency_ms: 50,
        freshness_sec: 10,
      },
      max_price: 0.0001,
      settlement_mode: "streaming",
      sent_at_ms: 1000,
      expires_at_ms: 2000,
    };

    const result = intentSchema.parse(message);
    expect(result.scope).toEqual({ region: "NYC", type: "forecast" });
  });
});

describe("ASK message", () => {
  it("should validate a valid ASK message", () => {
    const message = {
      protocol_version: "pact/1.0",
      type: "ASK",
      intent_id: "test-intent-123",
      price: 0.0001,
      unit: "request",
      latency_ms: 50,
      valid_for_ms: 1000,
      bond_required: 0.00001,
      sent_at_ms: 1000,
      expires_at_ms: 2000, // sent_at_ms + valid_for_ms
    };

    const result = askSchema.parse(message);
    expect(result.type).toBe("ASK");
    expect(result.price).toBe(0.0001);
  });

  it("should reject ASK with invalid expires_at_ms", () => {
    const message = {
      protocol_version: "pact/1.0",
      type: "ASK",
      intent_id: "test-intent-123",
      price: 0.0001,
      unit: "request",
      latency_ms: 50,
      valid_for_ms: 1000,
      bond_required: 0.00001,
      sent_at_ms: 1000,
      expires_at_ms: 3000, // Should be 2000
    };

    expect(() => askSchema.parse(message)).toThrow();
  });

  it("should reject ASK with non-positive price", () => {
    const message = {
      protocol_version: "pact/1.0",
      type: "ASK",
      intent_id: "test-intent-123",
      price: 0, // Should be positive
      unit: "request",
      latency_ms: 50,
      valid_for_ms: 1000,
      bond_required: 0.00001,
      sent_at_ms: 1000,
      expires_at_ms: 2000,
    };

    expect(() => askSchema.parse(message)).toThrow();
  });
});

describe("BID message", () => {
  it("should validate a valid BID message", () => {
    const message = {
      protocol_version: "pact/1.0",
      type: "BID",
      intent_id: "test-intent-123",
      price: 0.00008,
      unit: "request",
      latency_ms: 50,
      valid_for_ms: 1000,
      bond_required: 0.00001,
      bond_offered: 0.00002,
      sent_at_ms: 1000,
      expires_at_ms: 2000,
    };

    const result = bidSchema.parse(message);
    expect(result.type).toBe("BID");
    expect(result.bond_offered).toBe(0.00002);
  });

  it("should accept BID without bond_offered", () => {
    const message = {
      protocol_version: "pact/1.0",
      type: "BID",
      intent_id: "test-intent-123",
      price: 0.00008,
      unit: "request",
      latency_ms: 50,
      valid_for_ms: 1000,
      bond_required: 0.00001,
      sent_at_ms: 1000,
      expires_at_ms: 2000,
    };

    const result = bidSchema.parse(message);
    expect(result.bond_offered).toBeUndefined();
  });
});

describe("ACCEPT message", () => {
  it("should validate a valid ACCEPT message", () => {
    const message = {
      protocol_version: "pact/1.0",
      type: "ACCEPT",
      intent_id: "test-intent-123",
      agreed_price: 0.00009,
      settlement_mode: "hash_reveal",
      proof_type: "hash_reveal",
      challenge_window_ms: 150,
      delivery_deadline_ms: 5000,
      sent_at_ms: 1000,
      expires_at_ms: 2000,
    };

    const result = acceptSchema.parse(message);
    expect(result.type).toBe("ACCEPT");
    expect(result.agreed_price).toBe(0.00009);
  });
});

describe("REJECT message", () => {
  it("should validate a valid REJECT message", () => {
    const message = {
      protocol_version: "pact/1.0",
      type: "REJECT",
      intent_id: "test-intent-123",
      reason: "Price too high",
      code: "QUOTE_OUT_OF_BAND",
      sent_at_ms: 1000,
      expires_at_ms: 2000,
    };

    const result = rejectSchema.parse(message);
    expect(result.type).toBe("REJECT");
    expect(result.code).toBe("QUOTE_OUT_OF_BAND");
  });

  it("should accept REJECT without code", () => {
    const message = {
      protocol_version: "pact/1.0",
      type: "REJECT",
      intent_id: "test-intent-123",
      reason: "Price too high",
      sent_at_ms: 1000,
      expires_at_ms: 2000,
    };

    const result = rejectSchema.parse(message);
    expect(result.code).toBeUndefined();
  });
});

describe("COMMIT message", () => {
  it("should validate a valid COMMIT message", () => {
    const message = {
      protocol_version: "pact/1.0",
      type: "COMMIT",
      intent_id: "test-intent-123",
      commit_hash_hex: "a".repeat(64),
      sent_at_ms: 1000,
      expires_at_ms: 2000,
    };

    const result = commitSchema.parse(message);
    expect(result.type).toBe("COMMIT");
    expect(result.commit_hash_hex).toHaveLength(64);
  });

  it("should reject COMMIT with invalid hash length", () => {
    const message = {
      protocol_version: "pact/1.0",
      type: "COMMIT",
      intent_id: "test-intent-123",
      commit_hash_hex: "abc", // Too short
      sent_at_ms: 1000,
      expires_at_ms: 2000,
    };

    expect(() => commitSchema.parse(message)).toThrow();
  });
});

describe("REVEAL message", () => {
  it("should validate a valid REVEAL message", () => {
    const message = {
      protocol_version: "pact/1.0",
      type: "REVEAL",
      intent_id: "test-intent-123",
      payload_b64: "dGVzdA==",
      nonce_b64: "bm9uY2U=",
      sent_at_ms: 1000,
      expires_at_ms: 2000,
    };

    const result = revealSchema.parse(message);
    expect(result.type).toBe("REVEAL");
  });
});

describe("RECEIPT message", () => {
  it("should validate a valid RECEIPT message", () => {
    const message = {
      protocol_version: "pact/1.0",
      type: "RECEIPT",
      intent_id: "test-intent-123",
      buyer_agent_id: "buyer-123",
      seller_agent_id: "seller-456",
      agreed_price: 0.00009,
      fulfilled: true,
      latency_ms: 45,
      timestamp_ms: 2000,
    };

    const result = receiptSchema.parse(message);
    expect(result.type).toBe("RECEIPT");
    expect(result.fulfilled).toBe(true);
  });

  it("should accept RECEIPT with failure_code", () => {
    const message = {
      protocol_version: "pact/1.0",
      type: "RECEIPT",
      intent_id: "test-intent-123",
      buyer_agent_id: "buyer-123",
      seller_agent_id: "seller-456",
      agreed_price: 0.00009,
      fulfilled: false,
      failure_code: "LATENCY_BREACH",
      timestamp_ms: 2000,
    };

    const result = receiptSchema.parse(message);
    expect(result.failure_code).toBe("LATENCY_BREACH");
  });
});

describe("parseMessage", () => {
  it("should parse INTENT message", () => {
    const message = {
      protocol_version: "pact/1.0",
      type: "INTENT",
      intent_id: "test-intent-123",
      intent: "weather.data",
      scope: "NYC",
      constraints: {
        latency_ms: 50,
        freshness_sec: 10,
      },
      max_price: 0.0001,
      settlement_mode: "streaming",
      sent_at_ms: 1000,
      expires_at_ms: 2000,
    };

    const result = parseMessage(message);
    expect(result.type).toBe("INTENT");
  });

  it("should reject invalid message", () => {
    const message = {
      protocol_version: "pact/1.0",
      type: "INVALID",
    };

    expect(() => parseMessage(message)).toThrow();
  });

  it("should reject message with wrong protocol_version", () => {
    const message = {
      protocol_version: "pact/2.0",
      type: "INTENT",
      intent_id: "test-intent-123",
      intent: "weather.data",
      scope: "NYC",
      constraints: {
        latency_ms: 50,
        freshness_sec: 10,
      },
      max_price: 0.0001,
      settlement_mode: "streaming",
      sent_at_ms: 1000,
      expires_at_ms: 2000,
    };

    expect(() => parseMessage(message)).toThrow();
  });
});

