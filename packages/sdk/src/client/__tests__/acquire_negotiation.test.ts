import { describe, it, expect } from "vitest";
import nacl from "tweetnacl";
import bs58 from "bs58";
import * as fs from "fs";
import { acquire } from "../acquire";
import { createDefaultPolicy } from "../../policy/defaultPolicy";
import { MockSettlementProvider } from "../../settlement/mock";
import { ReceiptStore } from "../../reputation/store";
import { InMemoryProviderDirectory } from "../../directory/registry";
import { startProviderServer } from "@pact/provider-adapter";

describe("acquire with negotiation rounds", () => {
  // Helper to create keypairs
  function createKeyPair() {
    const keyPair = nacl.sign.keyPair();
    const id = bs58.encode(Buffer.from(keyPair.publicKey));
    return { keyPair, id };
  }

  // Helper to create deterministic clock
  function createClock() {
    let now = 1000;
    return () => {
      const current = now;
      now += 1000;
      return current;
    };
  }

  it("should record negotiation rounds in transcript for negotiated regime", async () => {
    const buyer = createKeyPair();
    const seller = createKeyPair();
    const policy = createDefaultPolicy();
    const settlement = new MockSettlementProvider();
    settlement.credit(buyer.id, 1.0);
    settlement.credit(seller.id, 0.1);
    const store = new ReceiptStore();
    const directory = new InMemoryProviderDirectory();
    
    // Add receipts to trigger negotiated regime (tradeCount >= 5)
    const intentType = "weather.data";
    for (let i = 0; i < 5; i++) {
      store.ingest({
        receipt_id: `receipt-${i}`,
        intent_id: `intent-${i}`,
        intent_type: intentType,
        buyer_agent_id: buyer.id,
        seller_agent_id: seller.id,
        agreed_price: 0.0001,
        fulfilled: true,
        timestamp_ms: 1000 + i * 1000,
      });
    }
    
    // Start HTTP provider server
    const server = startProviderServer({
      port: 0,
      sellerKeyPair: seller.keyPair,
      sellerId: seller.id,
    });

    try {
      // Register provider with HTTP endpoint
      directory.registerProvider({
        provider_id: seller.id,
        intentType: intentType,
        pubkey_b58: seller.id,
        endpoint: server.url,
        credentials: [],
        baseline_latency_ms: 50,
      });

      const result = await acquire({
        input: {
          intentType: intentType,
          scope: "NYC",
          constraints: { latency_ms: 50, freshness_sec: 10 },
          maxPrice: 0.0002,
          saveTranscript: true,
          negotiation: {
            strategy: "banded_concession",
            params: {
              band_pct: 0.1,
              max_rounds: 3,
            },
          },
        },
        buyerKeyPair: buyer.keyPair,
        sellerKeyPair: seller.keyPair,
        buyerId: buyer.id,
        sellerId: seller.id,
        policy,
        settlement,
        store,
        directory,
        now: createClock(),
      });

      // Hard-fail if acquisition doesn't succeed
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(`Acquisition failed: ${result.code} - ${result.reason}`);
      }
      
      expect(result.transcriptPath).toBeDefined();
      const transcriptContent = fs.readFileSync(result.transcriptPath!, "utf-8");
      const transcript = JSON.parse(transcriptContent);
      
      // Verify negotiation block exists
      expect(transcript.negotiation).toBeDefined();
      expect(transcript.negotiation.strategy).toBe("banded_concession");
      
      // Verify negotiation rounds are recorded (v2.3+) when in negotiated regime
      expect(transcript.negotiation_rounds).toBeDefined();
      expect(transcript.negotiation_rounds.length).toBeGreaterThan(0);
      
      // Verify round structure
      const firstRound = transcript.negotiation_rounds[0];
      expect(firstRound.round).toBeDefined();
      expect(firstRound.ask_price).toBeDefined();
      expect(firstRound.counter_price).toBeDefined();
      expect(typeof firstRound.accepted).toBe("boolean");
      expect(firstRound.reason).toBeDefined();
      expect(firstRound.timestamp_ms).toBeDefined();
      
      // Verify agreed_price equals expected accepted price
      const lastRound = transcript.negotiation_rounds[transcript.negotiation_rounds.length - 1];
      if (lastRound.accepted) {
        expect(result.receipt.agreed_price).toBe(lastRound.ask_price);
      } else {
        expect(result.receipt.agreed_price).toBe(lastRound.counter_price);
      }
    } finally {
      server.close();
    }
  });
});

