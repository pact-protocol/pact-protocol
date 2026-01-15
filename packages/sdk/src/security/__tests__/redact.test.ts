/**
 * Secret Redaction Tests (v2 Phase 4)
 * 
 * Tests for secret redaction and transcript validation.
 */

import { describe, it, expect } from "vitest";
import { redactSecrets, assertNoSecretsInTranscript } from "../redact";

describe("redactSecrets", () => {
  it("should redact secret keys", () => {
    const obj = {
      name: "test",
      api_key: "sk_live_1234567890",
      value: "normal",
    };
    
    const redacted = redactSecrets(obj);
    
    expect(redacted).toEqual({
      name: "test",
      api_key: "[REDACTED]",
      value: "normal",
    });
  });
  
  it("should redact private keys", () => {
    const obj = {
      public_key: "pub_123",
      private_key: "priv_456",
    };
    
    const redacted = redactSecrets(obj);
    
    expect(redacted).toEqual({
      public_key: "pub_123",
      private_key: "[REDACTED]",
    });
  });
  
  it("should redact nested secrets", () => {
    const obj = {
      user: {
        name: "Alice",
        password: "secret123",
        settings: {
          api_token: "token_abc",
        },
      },
    };
    
    const redacted = redactSecrets(obj);
    
    expect(redacted).toEqual({
      user: {
        name: "Alice",
        password: "[REDACTED]",
        settings: {
          api_token: "[REDACTED]",
        },
      },
    });
  });
  
  it("should redact secrets in arrays", () => {
    const obj = {
      items: [
        { name: "item1", secret: "secret1" },
        { name: "item2", token: "token2" },
      ],
    };
    
    const redacted = redactSecrets(obj);
    
    expect(redacted).toEqual({
      items: [
        { name: "item1", secret: "[REDACTED]" },
        { name: "item2", token: "[REDACTED]" },
      ],
    });
  });
  
  it("should handle case-insensitive matching", () => {
    const obj = {
      API_KEY: "key1",
      PrivateKey: "key2",
      SECRET_TOKEN: "token1",
    };
    
    const redacted = redactSecrets(obj);
    
    expect(redacted).toEqual({
      API_KEY: "[REDACTED]",
      PrivateKey: "[REDACTED]",
      SECRET_TOKEN: "[REDACTED]",
    });
  });
  
  it("should not modify original object", () => {
    const obj = {
      name: "test",
      api_key: "secret123",
    };
    
    const redacted = redactSecrets(obj);
    
    // Original should be unchanged
    expect(obj.api_key).toBe("secret123");
    // Redacted should have redacted value
    expect((redacted as any).api_key).toBe("[REDACTED]");
  });
  
  it("should handle null and undefined", () => {
    expect(redactSecrets(null)).toBeNull();
    expect(redactSecrets(undefined)).toBeUndefined();
  });
  
  it("should handle primitives", () => {
    expect(redactSecrets("string")).toBe("string");
    expect(redactSecrets(123)).toBe(123);
    expect(redactSecrets(true)).toBe(true);
  });
  
  it("should handle empty objects", () => {
    expect(redactSecrets({})).toEqual({});
  });
  
  it("should handle empty arrays", () => {
    expect(redactSecrets([])).toEqual([]);
  });
  
  it("should redact mnemonic", () => {
    const obj = {
      mnemonic: "word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12",
    };
    
    const redacted = redactSecrets(obj);
    expect((redacted as any).mnemonic).toBe("[REDACTED]");
  });
  
  it("should redact passphrase", () => {
    const obj = {
      passphrase: "my-secret-passphrase",
    };
    
    const redacted = redactSecrets(obj);
    expect((redacted as any).passphrase).toBe("[REDACTED]");
  });
});

describe("assertNoSecretsInTranscript", () => {
  it("should pass for transcript without secrets", () => {
    const transcript = {
      intent_id: "intent-123",
      outcome: { ok: true },
      wallet: {
        address: "0x1234",
        chain: "evm",
      },
    };
    
    const result = assertNoSecretsInTranscript(transcript);
    expect(result.ok).toBe(true);
  });
  
  it("should fail for transcript with api_key", () => {
    const transcript = {
      intent_id: "intent-123",
      wallet: {
        address: "0x1234",
        api_key: "sk_live_1234567890",
      },
    };
    
    const result = assertNoSecretsInTranscript(transcript);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("api_key");
    }
  });
  
  it("should fail for transcript with private_key", () => {
    const transcript = {
      intent_id: "intent-123",
      wallet: {
        address: "0x1234",
        private_key: "0xabcdef",
      },
    };
    
    const result = assertNoSecretsInTranscript(transcript);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("private_key");
    }
  });
  
  it("should fail for transcript with nested secret", () => {
    const transcript = {
      intent_id: "intent-123",
      wallet: {
        address: "0x1234",
        config: {
          secret: "nested-secret",
        },
      },
    };
    
    const result = assertNoSecretsInTranscript(transcript);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("secret");
    }
  });
  
  it("should fail for transcript with multiple secrets", () => {
    const transcript = {
      intent_id: "intent-123",
      api_key: "key1",
      private_key: "key2",
      token: "token1",
    };
    
    const result = assertNoSecretsInTranscript(transcript);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Should mention all secret keys
      expect(result.reason).toContain("api_key");
      expect(result.reason).toContain("private_key");
      expect(result.reason).toContain("token");
    }
  });
  
  it("should handle transcript with [REDACTED] values (already redacted)", () => {
    const transcript = {
      intent_id: "intent-123",
      api_key: "[REDACTED]",
    };
    
    // If value is already "[REDACTED]", it's not a secret
    const result = assertNoSecretsInTranscript(transcript);
    expect(result.ok).toBe(true);
  });
  
  it("should handle complex nested structures", () => {
    const transcript = {
      intent_id: "intent-123",
      wallet: {
        address: "0x1234",
        params: {
          nested: {
            deep: {
              secret: "very-secret",
            },
          },
        },
      },
    };
    
    const result = assertNoSecretsInTranscript(transcript);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("secret");
    }
  });
});
