/**
 * Reputation Tests
 */

import { describe, it, expect } from "vitest";
import { ReceiptStore, receiptValue, priceStats, referencePriceP50, agentScore } from "../index";
import type { Receipt } from "../../exchange/receipt";

describe("reputation", () => {
  describe("receiptValue", () => {
    it("uses paid_amount if present", () => {
      const r: Receipt = {
        receipt_id: "r1",
        intent_id: "i1",
        buyer_agent_id: "buyer",
        seller_agent_id: "seller",
        agreed_price: 0.1,
        fulfilled: true,
        paid_amount: 0.05,
        timestamp_ms: Date.now(),
      };
      expect(receiptValue(r)).toBe(0.05);
    });

    it("falls back to agreed_price if paid_amount missing", () => {
      const r: Receipt = {
        receipt_id: "r1",
        intent_id: "i1",
        buyer_agent_id: "buyer",
        seller_agent_id: "seller",
        agreed_price: 0.1,
        fulfilled: true,
        timestamp_ms: Date.now(),
      };
      expect(receiptValue(r)).toBe(0.1);
    });
  });

  describe("priceStats", () => {
    it("computes p50 and p90 correctly", () => {
      const receipts: Receipt[] = [
        { receipt_id: "r1", intent_id: "i1", buyer_agent_id: "b", seller_agent_id: "s", agreed_price: 0.01, fulfilled: true, timestamp_ms: 1000 },
        { receipt_id: "r2", intent_id: "i1", buyer_agent_id: "b", seller_agent_id: "s", agreed_price: 0.02, fulfilled: true, timestamp_ms: 2000 },
        { receipt_id: "r3", intent_id: "i1", buyer_agent_id: "b", seller_agent_id: "s", agreed_price: 0.03, fulfilled: true, timestamp_ms: 3000 },
        { receipt_id: "r4", intent_id: "i1", buyer_agent_id: "b", seller_agent_id: "s", agreed_price: 0.04, fulfilled: true, timestamp_ms: 4000 },
        { receipt_id: "r5", intent_id: "i1", buyer_agent_id: "b", seller_agent_id: "s", agreed_price: 0.05, fulfilled: true, timestamp_ms: 5000 },
        { receipt_id: "r6", intent_id: "i1", buyer_agent_id: "b", seller_agent_id: "s", agreed_price: 0.06, fulfilled: true, timestamp_ms: 6000 },
        { receipt_id: "r7", intent_id: "i1", buyer_agent_id: "b", seller_agent_id: "s", agreed_price: 0.07, fulfilled: true, timestamp_ms: 7000 },
        { receipt_id: "r8", intent_id: "i1", buyer_agent_id: "b", seller_agent_id: "s", agreed_price: 0.08, fulfilled: true, timestamp_ms: 8000 },
        { receipt_id: "r9", intent_id: "i1", buyer_agent_id: "b", seller_agent_id: "s", agreed_price: 0.09, fulfilled: true, timestamp_ms: 9000 },
        { receipt_id: "r10", intent_id: "i1", buyer_agent_id: "b", seller_agent_id: "s", agreed_price: 0.10, fulfilled: true, timestamp_ms: 10000 },
      ];

      const stats = priceStats(receipts);
      expect(stats.n).toBe(10);
      expect(stats.p50).toBe(0.05); // 5th value (0-indexed: index 4)
      expect(stats.p90).toBe(0.09); // 9th value (0-indexed: index 8)
    });

    it("returns null for empty receipts", () => {
      const stats = priceStats([]);
      expect(stats.p50).toBeNull();
      expect(stats.p90).toBeNull();
      expect(stats.n).toBe(0);
    });
  });

  describe("referencePriceP50", () => {
    it("filters by intent_type", () => {
      const receipts: (Receipt | any)[] = [
        { receipt_id: "r1", intent_id: "i1", buyer_agent_id: "b", seller_agent_id: "s", agreed_price: 0.01, fulfilled: true, intent_type: "weather.data", timestamp_ms: 1000 },
        { receipt_id: "r2", intent_id: "i2", buyer_agent_id: "b", seller_agent_id: "s", agreed_price: 0.02, fulfilled: true, intent_type: "weather.data", timestamp_ms: 2000 },
        { receipt_id: "r3", intent_id: "i3", buyer_agent_id: "b", seller_agent_id: "s", agreed_price: 0.03, fulfilled: true, intent_type: "other.type", timestamp_ms: 3000 },
        { receipt_id: "r4", intent_id: "i4", buyer_agent_id: "b", seller_agent_id: "s", agreed_price: 0.04, fulfilled: true, intent_type: "weather.data", timestamp_ms: 4000 },
      ];

      const p50 = referencePriceP50("weather.data", receipts);
      expect(p50).toBe(0.02); // p50 of [0.01, 0.02, 0.04] = 0.02
    });

    it("returns null if no matching receipts", () => {
      const receipts: (Receipt | any)[] = [
        { receipt_id: "r1", intent_id: "i1", buyer_agent_id: "b", seller_agent_id: "s", agreed_price: 0.01, fulfilled: true, intent_type: "other.type", timestamp_ms: 1000 },
      ];

      const p50 = referencePriceP50("weather.data", receipts);
      expect(p50).toBeNull();
    });
  });

  describe("agentScore", () => {
    it("increases reputation with fulfilled trades", () => {
      const receipts: (Receipt | any)[] = [
        { receipt_id: "r1", intent_id: "i1", buyer_agent_id: "agent1", seller_agent_id: "s", agreed_price: 0.01, fulfilled: true, timestamp_ms: 1000 },
        { receipt_id: "r2", intent_id: "i2", buyer_agent_id: "agent1", seller_agent_id: "s", agreed_price: 0.01, fulfilled: true, timestamp_ms: 2000 },
        { receipt_id: "r3", intent_id: "i3", buyer_agent_id: "agent1", seller_agent_id: "s", agreed_price: 0.01, fulfilled: false, timestamp_ms: 3000 },
      ];

      const score = agentScore("agent1", receipts);
      expect(score.trades).toBe(3);
      expect(score.successRate).toBeCloseTo(2 / 3, 2);
      expect(score.failureRate).toBeCloseTo(1 / 3, 2);
      expect(score.volume).toBe(0.03);
      expect(score.reputation).toBeGreaterThan(0);
    });

    it("applies clique dampening when concentration > 0.6", () => {
      // All trades with same counterparty (concentration = 1.0)
      const receipts: (Receipt | any)[] = [
        { receipt_id: "r1", intent_id: "i1", buyer_agent_id: "agent1", seller_agent_id: "counterparty1", agreed_price: 0.01, fulfilled: true, timestamp_ms: 1000 },
        { receipt_id: "r2", intent_id: "i2", buyer_agent_id: "agent1", seller_agent_id: "counterparty1", agreed_price: 0.01, fulfilled: true, timestamp_ms: 2000 },
        { receipt_id: "r3", intent_id: "i3", buyer_agent_id: "agent1", seller_agent_id: "counterparty1", agreed_price: 0.01, fulfilled: true, timestamp_ms: 3000 },
        { receipt_id: "r4", intent_id: "i4", buyer_agent_id: "agent1", seller_agent_id: "counterparty1", agreed_price: 0.01, fulfilled: true, timestamp_ms: 4000 },
        { receipt_id: "r5", intent_id: "i5", buyer_agent_id: "agent1", seller_agent_id: "counterparty1", agreed_price: 0.01, fulfilled: true, timestamp_ms: 5000 },
      ];

      const score = agentScore("agent1", receipts);
      
      // With 100% success rate, baseline reputation would be 1.0
      // But clique dampening (concentration = 1.0 > 0.6) should halve it
      expect(score.reputation).toBeLessThan(0.6); // Should be around 0.5 due to dampening
      expect(score.trades).toBe(5);
    });

    it("returns default score for agent with no trades", () => {
      const score = agentScore("agent1", []);
      expect(score.reputation).toBe(0.5);
      expect(score.trades).toBe(0);
      expect(score.volume).toBe(0);
    });
  });

  describe("ReceiptStore", () => {
    it("stores and lists receipts", () => {
      const store = new ReceiptStore();
      const receipt: Receipt = {
        receipt_id: "r1",
        intent_id: "i1",
        buyer_agent_id: "b",
        seller_agent_id: "s",
        agreed_price: 0.01,
        fulfilled: true,
        timestamp_ms: 1000,
      };

      store.ingest(receipt);
      const list = store.list();
      expect(list).toHaveLength(1);
      expect(list[0].receipt_id).toBe("r1");
    });

    it("filters by intentType", () => {
      const store = new ReceiptStore();
      store.ingest({ receipt_id: "r1", intent_id: "i1", buyer_agent_id: "b", seller_agent_id: "s", agreed_price: 0.01, fulfilled: true, intent_type: "weather.data", timestamp_ms: 1000 });
      store.ingest({ receipt_id: "r2", intent_id: "i2", buyer_agent_id: "b", seller_agent_id: "s", agreed_price: 0.01, fulfilled: true, intent_type: "other.type", timestamp_ms: 2000 });

      const filtered = store.list({ intentType: "weather.data" });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].receipt_id).toBe("r1");
    });

    it("filters by agentId", () => {
      const store = new ReceiptStore();
      store.ingest({ receipt_id: "r1", intent_id: "i1", buyer_agent_id: "agent1", seller_agent_id: "s", agreed_price: 0.01, fulfilled: true, timestamp_ms: 1000 });
      store.ingest({ receipt_id: "r2", intent_id: "i2", buyer_agent_id: "b", seller_agent_id: "agent1", agreed_price: 0.01, fulfilled: true, timestamp_ms: 2000 });
      store.ingest({ receipt_id: "r3", intent_id: "i3", buyer_agent_id: "b", seller_agent_id: "s", agreed_price: 0.01, fulfilled: true, timestamp_ms: 3000 });

      const filtered = store.list({ agentId: "agent1" });
      expect(filtered).toHaveLength(2); // r1 as buyer, r2 as seller
    });
  });
});




