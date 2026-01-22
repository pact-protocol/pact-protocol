// packages/sdk/src/exchange/__tests__/streaming.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import nacl from "tweetnacl";
import bs58 from "bs58";

import { createDefaultPolicy } from "../../policy/defaultPolicy";
import { validatePolicyJson } from "../../policy/validate";
import { compilePolicy } from "../../policy/compiler";
import { MockSettlementProvider } from "../../settlement/mock";
import { StreamingExchange } from "../streaming";

describe("StreamingExchange", () => {
  let buyerKeyPair: nacl.SignKeyPair;
  let sellerKeyPair: nacl.SignKeyPair;
  let buyerId: string;
  let sellerId: string;

  beforeEach(() => {
    buyerKeyPair = nacl.sign.keyPair();
    sellerKeyPair = nacl.sign.keyPair();
    buyerId = bs58.encode(Buffer.from(buyerKeyPair.publicKey));
    sellerId = bs58.encode(Buffer.from(sellerKeyPair.publicKey));
  });

  it("happy streaming completes - fulfilled true", () => {
    const settlement = new MockSettlementProvider();
    settlement.setBalance(buyerId, 1.0);
    settlement.setBalance(sellerId, 0.0);

    const policy = createDefaultPolicy(Date.now());
    // Make sure streaming caps are permissive for this test
    policy.settlement.streaming.max_spend_per_minute = 1000;

    const validated = validatePolicyJson(policy);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const compiled = compilePolicy(validated.policy);

    const totalBudget = 0.01;
    let now = 1000;

    const exchange = new StreamingExchange({
      settlement,
      policy: compiled,
      now: () => now,
      buyerId,
      sellerId,
      intentId: "intent-1",
      totalBudget,
      tickMs: 20,
      plannedTicks: 10
    });

    exchange.start();

    let receiptSeen = false;
    for (let i = 0; i < 50; i++) {
      now += 25; // advance time > tickMs
      const r = exchange.tick();
      if (r.receipt) {
        receiptSeen = true;
        expect(r.receipt.fulfilled).toBe(true);
        expect(r.receipt.paid_amount).toBeCloseTo(totalBudget, 6);
        expect(r.receipt.ticks).toBeGreaterThan(0);
        break;
      }
    }
    expect(receiptSeen).toBe(true);
  });

  it("buyer stops early - receipt fulfilled false and BUYER_STOPPED", () => {
    const settlement = new MockSettlementProvider();
    settlement.setBalance(buyerId, 1.0);
    settlement.setBalance(sellerId, 0.0);

    const policy = createDefaultPolicy(Date.now());
    policy.settlement.streaming.max_spend_per_minute = 1000;

    const validated = validatePolicyJson(policy);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const compiled = compilePolicy(validated.policy);

    const totalBudget = 0.01;
    let now = 1000;

    const exchange = new StreamingExchange({
      settlement,
      policy: compiled,
      now: () => now,
      buyerId,
      sellerId,
      intentId: "intent-2",
      totalBudget,
      tickMs: 20,
      plannedTicks: 50
    });

    exchange.start();

    // do a couple ticks
    now += 25; exchange.tick();
    now += 25; exchange.tick();

    const receipt = exchange.stop("buyer", "Buyer requested stop");
    expect(receipt.fulfilled).toBe(false);
    expect(receipt.paid_amount).toBeLessThan(totalBudget);
    expect(receipt.failure_code).toBe("BUYER_STOPPED");
  });

  it("spend cap exceeded - receipt failure_code FAILED_POLICY", () => {
    const settlement = new MockSettlementProvider();
    settlement.setBalance(buyerId, 1.0);
    settlement.setBalance(sellerId, 0.0);

    const policy = createDefaultPolicy(Date.now());
    // tiny cap so the cap check must trigger
    policy.settlement.streaming.max_spend_per_minute = 0.000001;
    policy.settlement.streaming.cutoff_on_violation = true;

    const validated = validatePolicyJson(policy);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const compiled = compilePolicy(validated.policy);

    const totalBudget = 0.01;
    let now = 1000;

    const exchange = new StreamingExchange({
      settlement,
      policy: compiled,
      now: () => now,
      buyerId,
      sellerId,
      intentId: "intent-3",
      totalBudget,
      tickMs: 20,
      plannedTicks: 10
    });

    exchange.start();

    let receiptSeen = false;
    for (let i = 0; i < 5; i++) {
      now += 25;
      const r = exchange.tick();
      if (r.receipt) {
        receiptSeen = true;
        expect(r.receipt.failure_code).toBe("FAILED_POLICY");
        expect(r.receipt.fulfilled).toBe(false);
        break;
      }
    }
    expect(receiptSeen).toBe(true);
  });

  it("chunk ordering enforced - invalid seq fails", () => {
    const settlement = new MockSettlementProvider();
    settlement.setBalance(buyerId, 1.0);
    settlement.setBalance(sellerId, 0.0);

    const policy = createDefaultPolicy(Date.now());
    policy.settlement.streaming.max_spend_per_minute = 1000;

    const validated = validatePolicyJson(policy);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const compiled = compilePolicy(validated.policy);

    let now = 1000;
    const exchange = new StreamingExchange({
      settlement,
      policy: compiled,
      now: () => now,
      buyerId,
      sellerId,
      intentId: "intent-4",
      totalBudget: 0.01,
      tickMs: 20,
      plannedTicks: 10
    });

    exchange.start();

    // seq 0 ok
    const ok0 = exchange.onChunk({ intent_id: "intent-4", seq: 0, chunk_b64: "AA==" });
    expect(ok0.ok).toBe(true);

    // seq 2 (skip) should fail
    const bad = exchange.onChunk({ intent_id: "intent-4", seq: 2, chunk_b64: "AA==" });
    expect(bad.ok).toBe(false);
  });
});
