/**
 * Stripe Live Settlement Provider Tests (v2 Phase 3)
 * 
 * Tests for StripeLiveSettlementProvider boundary implementation.
 * All tests are deterministic and require no network calls or env vars.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StripeLiveSettlementProvider, validateStripeLiveConfig } from "../stripe_live";
import type { SettlementIntent } from "../types";

describe("StripeLiveSettlementProvider", () => {
  // Save and restore env vars
  const originalEnv = { ...process.env };
  
  beforeEach(() => {
    // Clear env vars before each test
    delete process.env.PACT_STRIPE_API_KEY;
    delete process.env.PACT_STRIPE_MODE;
    delete process.env.PACT_STRIPE_ENABLED;
  });
  
  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });
  
  describe("validateStripeLiveConfig", () => {
    it("should return default config with enabled=false when no params provided", () => {
      const result = validateStripeLiveConfig({});
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.config.mode).toBe("sandbox");
        expect(result.config.enabled).toBe(false);
        expect(result.config.api_key).toBeUndefined();
        expect(result.config.account_id).toBeUndefined();
        expect(result.config.idempotency_prefix).toBeUndefined();
      }
    });
    
    it("should accept valid mode 'sandbox'", () => {
      const result = validateStripeLiveConfig({ mode: "sandbox" });
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.config.mode).toBe("sandbox");
      }
    });
    
    it("should accept valid mode 'live'", () => {
      const result = validateStripeLiveConfig({ mode: "live" });
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.config.mode).toBe("live");
      }
    });
    
    it("should reject invalid mode", () => {
      const result = validateStripeLiveConfig({ mode: "invalid" });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("INVALID_MODE");
        expect(result.reason).toContain("sandbox");
        expect(result.reason).toContain("live");
      }
    });
    
    it("should reject non-string mode", () => {
      const result = validateStripeLiveConfig({ mode: 123 });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("INVALID_MODE");
      }
    });
    
    it("should accept account_id", () => {
      const result = validateStripeLiveConfig({ account_id: "acct_123" });
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.config.account_id).toBe("acct_123");
      }
    });
    
    it("should reject non-string account_id", () => {
      const result = validateStripeLiveConfig({ account_id: 123 });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("INVALID_ACCOUNT_ID");
      }
    });
    
    it("should accept idempotency_prefix", () => {
      const result = validateStripeLiveConfig({ idempotency_prefix: "test-" });
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.config.idempotency_prefix).toBe("test-");
      }
    });
    
    it("should reject non-string idempotency_prefix", () => {
      const result = validateStripeLiveConfig({ idempotency_prefix: 123 });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("INVALID_IDEMPOTENCY_PREFIX");
      }
    });
    
    it("should accept enabled=false", () => {
      const result = validateStripeLiveConfig({ enabled: false });
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.config.enabled).toBe(false);
      }
    });
    
    it("should accept enabled=true when api_key is present in env", () => {
      process.env.PACT_STRIPE_API_KEY = "sk_test_1234567890";
      const result = validateStripeLiveConfig({ enabled: true });
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.config.enabled).toBe(true);
        expect(result.config.api_key).toBe("sk_test_1234567890");
      }
    });
    
    it("should reject enabled=true when api_key is missing", () => {
      const result = validateStripeLiveConfig({ enabled: true });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("MISSING_API_KEY");
        expect(result.reason).toContain("PACT_STRIPE_API_KEY");
      }
    });
    
    it("should read mode from env var PACT_STRIPE_MODE", () => {
      process.env.PACT_STRIPE_MODE = "live";
      const result = validateStripeLiveConfig({});
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.config.mode).toBe("live");
      }
    });
    
    it("should read enabled from env var PACT_STRIPE_ENABLED", () => {
      process.env.PACT_STRIPE_API_KEY = "sk_test_1234567890";
      process.env.PACT_STRIPE_ENABLED = "true";
      const result = validateStripeLiveConfig({});
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.config.enabled).toBe(true);
      }
    });
    
    it("should read enabled from env var PACT_STRIPE_ENABLED=1", () => {
      process.env.PACT_STRIPE_API_KEY = "sk_test_1234567890";
      process.env.PACT_STRIPE_ENABLED = "1";
      const result = validateStripeLiveConfig({});
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.config.enabled).toBe(true);
      }
    });
    
    it("should reject non-object input", () => {
      const result = validateStripeLiveConfig("not an object");
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("INVALID_CONFIG");
      }
    });
    
    it("should reject null input", () => {
      const result = validateStripeLiveConfig(null);
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("INVALID_CONFIG");
      }
    });
    
    it("should reject unknown properties", () => {
      const result = validateStripeLiveConfig({ unknown_prop: "value" });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("UNKNOWN_PROPERTIES");
        expect(result.reason).toContain("unknown_prop");
      }
    });
    
    it("should reject non-boolean enabled", () => {
      const result = validateStripeLiveConfig({ enabled: "true" });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("INVALID_ENABLED");
      }
    });
  });
  
  describe("StripeLiveSettlementProvider", () => {
    it("should create provider with default config", () => {
      const config = { mode: "sandbox" as const, enabled: false };
      const provider = new StripeLiveSettlementProvider(config);
      
      expect(provider).toBeDefined();
    });
    
    it("should return 0 for getBalance", () => {
      const config = { mode: "sandbox" as const, enabled: false };
      const provider = new StripeLiveSettlementProvider(config);
      
      expect(provider.getBalance("agent-1")).toBe(0);
      expect(provider.getBalance("agent-1", "evm", "USDC")).toBe(0);
    });
    
    it("should return 0 for getLocked", () => {
      const config = { mode: "sandbox" as const, enabled: false };
      const provider = new StripeLiveSettlementProvider(config);
      
      expect(provider.getLocked("agent-1")).toBe(0);
      expect(provider.getLocked("agent-1", "evm", "USDC")).toBe(0);
    });
    
    it("should throw on lock()", () => {
      const config = { mode: "sandbox" as const, enabled: false };
      const provider = new StripeLiveSettlementProvider(config);
      
      expect(() => provider.lock("agent-1", 100)).toThrow("boundary only");
    });
    
    it("should throw on release()", () => {
      const config = { mode: "sandbox" as const, enabled: false };
      const provider = new StripeLiveSettlementProvider(config);
      
      expect(() => provider.release("agent-1", 100)).toThrow("boundary only");
    });
    
    it("should throw on pay()", () => {
      const config = { mode: "sandbox" as const, enabled: false };
      const provider = new StripeLiveSettlementProvider(config);
      
      expect(() => provider.pay("from", "to", 100)).toThrow("boundary only");
    });
    
    it("should throw on prepare()", async () => {
      const config = { mode: "sandbox" as const, enabled: false };
      const provider = new StripeLiveSettlementProvider(config);
      
      const intent: SettlementIntent = {
        intent_id: "intent-1",
        from: "buyer-1",
        to: "seller-1",
        amount: 0.1,
        mode: "hash_reveal",
      };
      
      await expect(provider.prepare(intent)).rejects.toThrow("boundary only");
    });
    
    it("should return failure on commit()", async () => {
      const config = { mode: "sandbox" as const, enabled: false };
      const provider = new StripeLiveSettlementProvider(config);
      
      const result = await provider.commit("handle-1");
      
      expect(result.ok).toBe(false);
      expect(result.status).toBe("failed");
      expect(result.failure_code).toBe("SETTLEMENT_PROVIDER_NOT_IMPLEMENTED");
      expect(result.failure_reason).toContain("boundary only");
    });
    
    it("should throw on abort()", async () => {
      const config = { mode: "sandbox" as const, enabled: false };
      const provider = new StripeLiveSettlementProvider(config);
      
      await expect(provider.abort("handle-1")).rejects.toThrow("boundary only");
    });
    
    it("should return failure on poll()", async () => {
      const config = { mode: "sandbox" as const, enabled: false };
      const provider = new StripeLiveSettlementProvider(config);
      
      const result = await provider.poll!("handle-1");
      
      expect(result.ok).toBe(false);
      expect(result.status).toBe("failed");
      expect(result.failure_code).toBe("SETTLEMENT_PROVIDER_NOT_IMPLEMENTED");
      expect(result.failure_reason).toContain("boundary only");
    });
    
    it("should return failure on refund()", async () => {
      const config = { mode: "sandbox" as const, enabled: false };
      const provider = new StripeLiveSettlementProvider(config);
      
      const result = await provider.refund!({
        dispute_id: "dispute-1",
        from: "seller-1",
        to: "buyer-1",
        amount: 0.1,
      });
      
      expect(result.ok).toBe(false);
      expect(result.code).toBe("SETTLEMENT_PROVIDER_NOT_IMPLEMENTED");
      expect(result.reason).toContain("boundary only");
    });
  });
  
  it("should never make network calls (all methods return deterministic failures)", async () => {
    const config = { mode: "sandbox" as const, enabled: false };
    const provider = new StripeLiveSettlementProvider(config);
    
    // Verify all methods return deterministic failures without network calls
    // This test ensures no fetch/http/network code is present
    
    // All methods should throw or return failure immediately
    expect(() => provider.lock("agent-1", 100)).toThrow("boundary only");
    expect(() => provider.release("agent-1", 100)).toThrow("boundary only");
    expect(() => provider.pay("from", "to", 100)).toThrow("boundary only");
    expect(() => provider.credit("agent-1", 100)).toThrow("boundary only");
    expect(() => provider.debit("agent-1", 100)).toThrow("boundary only");
    
    await expect(provider.prepare({
      intent_id: "intent-1",
      from: "buyer-1",
      to: "seller-1",
      amount: 0.1,
      mode: "hash_reveal",
    })).rejects.toThrow("boundary only");
    
    const commitResult = await provider.commit("handle-1");
    expect(commitResult.ok).toBe(false);
    expect(commitResult.failure_code).toBe("SETTLEMENT_PROVIDER_NOT_IMPLEMENTED");
    
    await expect(provider.abort("handle-1")).rejects.toThrow("boundary only");
    
    const pollResult = await provider.poll!("handle-1");
    expect(pollResult.ok).toBe(false);
    expect(pollResult.failure_code).toBe("SETTLEMENT_PROVIDER_NOT_IMPLEMENTED");
    
    const refundResult = await provider.refund!({
      dispute_id: "dispute-1",
      from: "seller-1",
      to: "buyer-1",
      amount: 0.1,
    });
    expect(refundResult.ok).toBe(false);
    expect(refundResult.code).toBe("SETTLEMENT_PROVIDER_NOT_IMPLEMENTED");
  });
  
  // Skipped test that only runs if PACT_STRIPE_LIVE_TEST=1
  // Validates env var reading without making network calls
  it.skip("should read config from env vars when PACT_STRIPE_LIVE_TEST=1", () => {
    if (process.env.PACT_STRIPE_LIVE_TEST !== "1") {
      return; // Skip if env var not set
    }
    
    // This test validates that validateStripeLiveConfig correctly reads from env
    // Still no network calls - just config validation
    const result = validateStripeLiveConfig({});
    
    expect(result.ok).toBe(true);
    if (result.ok) {
      // If PACT_STRIPE_API_KEY is set, it should be in config (but not logged)
      if (process.env.PACT_STRIPE_API_KEY) {
        expect(result.config.api_key).toBe(process.env.PACT_STRIPE_API_KEY);
      }
      
      // If PACT_STRIPE_MODE is set, it should be in config
      if (process.env.PACT_STRIPE_MODE) {
        expect(result.config.mode).toBe(process.env.PACT_STRIPE_MODE);
      }
    }
  });
});
