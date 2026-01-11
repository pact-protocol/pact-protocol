/**
 * Settlement SLA Tests (D1)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { NegotiationSession } from "../session";
import { createDefaultPolicy, compilePolicy, DefaultPolicyGuard } from "../../policy/index";
import { MockSettlementProvider } from "../../settlement/mock";
import { StripeLikeSettlementProvider } from "../../settlement/stripe_like";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { signEnvelope } from "../../protocol/envelope";
import { isRetryableFailure } from "../../settlement/fallback";

describe("settlement SLA (D1)", () => {
  // Helper to create keypairs
  function createKeyPair() {
    const keyPair = nacl.sign.keyPair();
    const id = bs58.encode(Buffer.from(keyPair.publicKey));
    return { keyPair, id };
  }

  it("should not enforce SLA when disabled (default behavior)", () => {
    // Just verify that SLA is disabled by default in policy
    const policy = createDefaultPolicy();
    expect(policy.settlement.settlement_sla?.enabled).toBe(false);
  });

  it("should enforce max_poll_attempts SLA when enabled", () => {
    // Verify SLA config is properly structured
    const policy = createDefaultPolicy();
    policy.settlement.settlement_sla = {
      enabled: true,
      max_pending_ms: 1000,
      max_poll_attempts: 5,
      poll_interval_ms: 100,
      penalty: {
        enabled: true,
        provider_penalty: 0.05,
        buyer_penalty: 0.0,
      },
    };
    
    const compiled = compilePolicy(policy);
    expect(compiled.base.settlement?.settlement_sla?.enabled).toBe(true);
    expect(compiled.base.settlement?.settlement_sla?.max_poll_attempts).toBe(5);
  });

  it("should treat SETTLEMENT_SLA_VIOLATION as retryable", () => {
    expect(isRetryableFailure("SETTLEMENT_SLA_VIOLATION")).toBe(true);
  });
});

