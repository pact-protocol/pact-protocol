import { describe, it, expect } from "vitest";
import {
  signEnvelope,
  verifyEnvelope,
  parseEnvelope,
  generateKeyPair,
  type SignedEnvelope,
} from "../envelope";
import bs58 from "bs58";
import type { IntentMessage } from "../types";

describe("signEnvelope", () => {
  it("should create a signed envelope", async () => {
    const keyPair = generateKeyPair();
    const message: IntentMessage = {
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

    const envelope = await signEnvelope(message, keyPair);

    expect(envelope.envelope_version).toBe("pact-envelope/1.0");
    expect(envelope.message).toEqual(message);
    expect(envelope.message_hash_hex).toBeDefined();
    expect(envelope.signer_public_key_b58).toBeDefined();
    expect(envelope.signature_b58).toBeDefined();
    expect(envelope.signed_at_ms).toBeGreaterThan(0);
  });

  it("should compute message_hash_hex from message only", async () => {
    const keyPair = generateKeyPair();
    const message: IntentMessage = {
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

    const envelope1 = await signEnvelope(message, keyPair);
    const envelope2 = await signEnvelope(message, keyPair);

    // Same message should produce same hash
    expect(envelope1.message_hash_hex).toBe(envelope2.message_hash_hex);
  });
});

describe("verifyEnvelope", () => {
  it("should verify a valid envelope", async () => {
    const keyPair = generateKeyPair();
    const message: IntentMessage = {
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

    const envelope = await signEnvelope(message, keyPair);
    const isValid = await verifyEnvelope(envelope);

    expect(isValid).toBe(true);
  });

  it("should reject envelope with tampered message", async () => {
    const keyPair = generateKeyPair();
    const message: IntentMessage = {
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

    const envelope = await signEnvelope(message, keyPair);
    // Tamper with message
    (envelope.message as IntentMessage).max_price = 0.0002;

    const isValid = await verifyEnvelope(envelope);

    expect(isValid).toBe(false);
  });

  it("should reject envelope with tampered signature", async () => {
    const keyPair = generateKeyPair();
    const message: IntentMessage = {
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

    const envelope = await signEnvelope(message, keyPair);
    // Tamper with signature
    envelope.signature_b58 = "invalid_signature";

    const isValid = await verifyEnvelope(envelope);

    expect(isValid).toBe(false);
  });

  it("should reject envelope with wrong signer", async () => {
    const keyPair1 = generateKeyPair();
    const keyPair2 = generateKeyPair();
    const message: IntentMessage = {
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

    const envelope = await signEnvelope(message, keyPair1);
    // Change public key to different keypair
    envelope.signer_public_key_b58 = bs58.encode(keyPair2.publicKey);

    const isValid = await verifyEnvelope(envelope);

    expect(isValid).toBe(false);
  });

  it("should reject envelope with invalid message", async () => {
    const keyPair = generateKeyPair();
    const message: IntentMessage = {
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

    const envelope = await signEnvelope(message, keyPair);
    // Make message invalid
    (envelope.message as any).type = "INVALID";

    const isValid = await verifyEnvelope(envelope);

    expect(isValid).toBe(false);
  });
});

describe("parseEnvelope", () => {
  it("should parse a valid envelope", async () => {
    const keyPair = generateKeyPair();
    const message: IntentMessage = {
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

    const envelope = await signEnvelope(message, keyPair);
    const parsed = await parseEnvelope(envelope);

    expect(parsed.envelope_version).toBe("pact-envelope/1.0");
    expect(parsed.message.type).toBe("INTENT");
  });

  it("should reject envelope with wrong envelope_version", async () => {
    const keyPair = generateKeyPair();
    const message: IntentMessage = {
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

    const envelope = await signEnvelope(message, keyPair);
    (envelope as any).envelope_version = "pact-envelope/2.0";

    await expect(parseEnvelope(envelope)).rejects.toThrow();
  });

  it("should reject envelope missing message", async () => {
    const invalidEnvelope = {
      envelope_version: "pact-envelope/1.0",
      // missing message
    };

    await expect(parseEnvelope(invalidEnvelope)).rejects.toThrow();
  });
});

