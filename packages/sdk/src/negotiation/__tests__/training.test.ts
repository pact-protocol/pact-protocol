import { describe, it, expect } from "vitest";
import { transcriptToTrainingRow, type TrainingRow } from "../training";
import type { TranscriptV1 } from "../../transcript/types";

describe("transcriptToTrainingRow", () => {
  it("should convert transcript to training row with required fields", () => {
    const transcript: TranscriptV1 = {
      version: "1",
      intent_id: "test-intent-1",
      intent_type: "weather.data",
      timestamp_ms: 1000,
      input: {
        intentType: "weather.data",
        scope: "NYC",
        constraints: {
          latency_ms: 50,
          freshness_sec: 10,
        },
        maxPrice: 0.0002,
      },
      directory: [],
      credential_checks: [],
      quotes: [],
      outcome: {
        ok: true,
      },
      negotiation: {
        strategy: "ml_stub",
        rounds_used: 2,
        log: [
          {
            round: 0,
            timestamp_ms: 1000,
            decision: {
              type: "start",
              quote_price: 0.0001,
              max_price: 0.0002,
            },
          },
          {
            round: 1,
            timestamp_ms: 1100,
            decision: {
              type: "counteroffer",
              buyer_price: 0.000095,
              provider_price: 0.0001,
            },
          },
          {
            round: 2,
            timestamp_ms: 1200,
            decision: {
              type: "accepted_quote",
              price: 0.0001,
            },
          },
          {
            round: 2,
            timestamp_ms: 1201,
            decision: {
              type: "done",
              final_price: 0.0001,
            },
          },
        ],
      },
      negotiation_rounds: [
        {
          round: 1,
          ask_price: 0.0001,
          counter_price: 0.000095,
          accepted: false,
          reason: "Round 1 counteroffer",
          timestamp_ms: 1100,
        },
        {
          round: 2,
          ask_price: 0.0001,
          counter_price: 0.0001,
          accepted: true,
          reason: "Accepted",
          timestamp_ms: 1200,
        },
      ],
      receipt: {
        receipt_id: "receipt-1",
        intent_id: "test-intent-1",
        intent_type: "weather.data",
        buyer_agent_id: "buyer1",
        seller_agent_id: "seller1",
        agreed_price: 0.0001,
        fulfilled: true,
        timestamp_ms: 1200,
      },
    };

    const row = transcriptToTrainingRow(transcript);

    expect(row).not.toBeNull();
    expect(row!.intent_type).toBe("weather.data");
    expect(row!.constraints.latency_ms).toBe(50);
    expect(row!.constraints.freshness_sec).toBe(10);
    expect(row!.negotiation_strategy).toBe("ml_stub");
    expect(row!.rounds_summary.rounds_used).toBe(2);
    expect(row!.rounds_summary.final_round_accepted).toBe(true);
    expect(row!.accepted_price).toBe(0.0001);
    expect(row!.quote_price).toBe(0.0001);
    expect(row!.max_price).toBe(0.0002);
    expect(row!.outcome).toBe("accepted");
  });

  it("should not include forbidden fields (privateKey/secretKey/mnemonic)", () => {
    const transcript: TranscriptV1 = {
      version: "1",
      intent_id: "test-intent-2",
      intent_type: "weather.data",
      timestamp_ms: 1000,
      input: {
        intentType: "weather.data",
        scope: "NYC",
        constraints: {
          latency_ms: 50,
          freshness_sec: 10,
        },
        maxPrice: 0.0002,
        // These should not appear in training row
        wallet: {
          provider: "test",
          params: {
            privateKey: "should-not-appear",
            secretKey: "should-not-appear",
            mnemonic: "should-not-appear",
          },
        },
      },
      directory: [],
      credential_checks: [],
      quotes: [],
      outcome: {
        ok: true,
      },
      negotiation: {
        strategy: "baseline",
        rounds_used: 1,
        log: [
          {
            round: 0,
            timestamp_ms: 1000,
            decision: {
              type: "start",
              quote_price: 0.0001,
              max_price: 0.0002,
            },
          },
          {
            round: 1,
            timestamp_ms: 1100,
            decision: {
              type: "done",
              final_price: 0.0001,
            },
          },
        ],
      },
      receipt: {
        receipt_id: "receipt-2",
        intent_id: "test-intent-2",
        intent_type: "weather.data",
        buyer_agent_id: "buyer1",
        seller_agent_id: "seller1",
        agreed_price: 0.0001,
        fulfilled: true,
        timestamp_ms: 1100,
      },
    };

    const row = transcriptToTrainingRow(transcript);
    const rowJson = JSON.stringify(row);

    // Verify forbidden fields are not present
    expect(rowJson).not.toContain("privateKey");
    expect(rowJson).not.toContain("secretKey");
    expect(rowJson).not.toContain("mnemonic");
    expect(rowJson).not.toContain("should-not-appear");
  });

  it("should produce stable output (deterministic)", () => {
    const transcript: TranscriptV1 = {
      version: "1",
      intent_id: "test-intent-3",
      intent_type: "weather.data",
      timestamp_ms: 1000,
      asset: "USDC",
      chain: "evm",
      input: {
        intentType: "weather.data",
        scope: "NYC",
        constraints: {
          latency_ms: 50,
          freshness_sec: 10,
        },
        maxPrice: 0.0002,
        urgent: true,
        negotiation: {
          strategy: "banded_concession",
          params: {
            band_pct: 0.1,
          },
        },
      },
      directory: [],
      credential_checks: [
        {
          pubkey_b58: "provider1",
          ok: true,
          trust_tier: "trusted",
          trust_score: 0.85,
        },
      ],
      quotes: [
        {
          pubkey_b58: "provider1",
          ok: true,
          quote_summary: {
            quote_price: 0.0001,
            reference_price_p50: 0.00009,
          },
        },
      ],
      outcome: {
        ok: true,
      },
      negotiation: {
        strategy: "banded_concession",
        rounds_used: 2,
        log: [
          {
            round: 0,
            timestamp_ms: 1000,
            decision: {
              type: "start",
              quote_price: 0.0001,
              max_price: 0.0002,
            },
          },
          {
            round: 1,
            timestamp_ms: 1100,
            decision: {
              type: "counteroffer",
              buyer_price: 0.000095,
              provider_price: 0.0001,
            },
          },
          {
            round: 2,
            timestamp_ms: 1200,
            decision: {
              type: "done",
              final_price: 0.0001,
            },
          },
        ],
      },
      negotiation_rounds: [
        {
          round: 1,
          ask_price: 0.0001,
          counter_price: 0.000095,
          accepted: false,
          reason: "Round 1",
          timestamp_ms: 1100,
        },
        {
          round: 2,
          ask_price: 0.0001,
          counter_price: 0.0001,
          accepted: true,
          reason: "Accepted",
          timestamp_ms: 1200,
        },
      ],
      wallet: {
        kind: "ethers",
        chain: "evm",
        address: "0x1234",
        used: true,
        capabilities: {
          chain: "evm",
          can_sign_message: true,
          can_sign_transaction: true,
        },
      },
      receipt: {
        receipt_id: "receipt-3",
        intent_id: "test-intent-3",
        intent_type: "weather.data",
        buyer_agent_id: "buyer1",
        seller_agent_id: "seller1",
        agreed_price: 0.0001,
        fulfilled: true,
        timestamp_ms: 1200,
      },
    };

    const row1 = transcriptToTrainingRow(transcript);
    const row2 = transcriptToTrainingRow(transcript);
    const row3 = transcriptToTrainingRow(transcript);

    // All should be identical
    expect(row1).toEqual(row2);
    expect(row2).toEqual(row3);

    // Verify optional fields are present
    expect(row1!.asset).toBe("USDC");
    expect(row1!.chain).toBe("evm");
    expect(row1!.urgent).toBe(true);
    expect(row1!.trust_tier).toBe("trusted");
    expect(row1!.trust_score).toBe(0.85);
    expect(row1!.wallet_can_sign_message).toBe(true);
    expect(row1!.wallet_can_sign_transaction).toBe(true);
    expect(row1!.wallet_chain).toBe("evm");
    expect(row1!.reference_price).toBe(0.00009);
    expect(row1!.band_pct).toBe(0.1);
    expect(row1!.rounds_summary.avg_counter_ratio).toBeDefined();
    expect(row1!.rounds_summary.final_counter_ratio).toBeDefined();
  });

  it("should return null for transcripts missing required fields", () => {
    const transcript1: Partial<TranscriptV1> = {
      version: "1",
      intent_id: "test",
      // Missing intent_type
      timestamp_ms: 1000,
      input: {
        intentType: "weather.data",
        scope: "NYC",
        constraints: {
          latency_ms: 50,
          freshness_sec: 10,
        },
        maxPrice: 0.0002,
      },
      directory: [],
      credential_checks: [],
      quotes: [],
      outcome: { ok: true },
      negotiation: {
        strategy: "baseline",
        rounds_used: 1,
        log: [],
      },
    };

    expect(transcriptToTrainingRow(transcript1 as TranscriptV1)).toBeNull();

    const transcript2: Partial<TranscriptV1> = {
      version: "1",
      intent_id: "test",
      intent_type: "weather.data",
      timestamp_ms: 1000,
      // Missing input.constraints
      input: {
        intentType: "weather.data",
        scope: "NYC",
        maxPrice: 0.0002,
      },
      directory: [],
      credential_checks: [],
      quotes: [],
      outcome: { ok: true },
      negotiation: {
        strategy: "baseline",
        rounds_used: 1,
        log: [],
      },
    };

    expect(transcriptToTrainingRow(transcript2 as TranscriptV1)).toBeNull();
  });

  it("should handle ML metadata correctly", () => {
    const transcript: TranscriptV1 = {
      version: "1",
      intent_id: "test-intent-ml",
      intent_type: "weather.data",
      timestamp_ms: 1000,
      input: {
        intentType: "weather.data",
        scope: "NYC",
        constraints: {
          latency_ms: 50,
          freshness_sec: 10,
        },
        maxPrice: 0.0002,
      },
      directory: [],
      credential_checks: [],
      quotes: [],
      outcome: {
        ok: true,
      },
      negotiation: {
        strategy: "ml_stub",
        rounds_used: 1,
        log: [
          {
            round: 0,
            timestamp_ms: 1000,
            decision: {
              type: "start",
              quote_price: 0.0001,
              max_price: 0.0002,
            },
          },
          {
            round: 1,
            timestamp_ms: 1100,
            decision: {
              type: "done",
              final_price: 0.0001,
            },
          },
        ],
        ml: {
          scorer: "stub",
          selected_candidate_idx: 1,
          top_scores: [
            { idx: 1, score: 150.5, reason: "proximity_to_ref" }, // Highest score first (sorted)
            { idx: 0, score: 100.5, reason: "within_max" },
            { idx: 2, score: 80.2, reason: "below_reference" },
          ],
        },
      },
      receipt: {
        receipt_id: "receipt-ml",
        intent_id: "test-intent-ml",
        intent_type: "weather.data",
        buyer_agent_id: "buyer1",
        seller_agent_id: "seller1",
        agreed_price: 0.0001,
        fulfilled: true,
        timestamp_ms: 1100,
      },
    };

    const row = transcriptToTrainingRow(transcript);

    expect(row).not.toBeNull();
    expect(row!.ml_scorer).toBe("stub");
    expect(row!.ml_selected_candidate_idx).toBe(1);
    expect(row!.ml_top_score).toBe(150.5);
  });

  it("should handle different outcome types", () => {
    const baseTranscript: Partial<TranscriptV1> = {
      version: "1",
      intent_id: "test",
      intent_type: "weather.data",
      timestamp_ms: 1000,
      input: {
        intentType: "weather.data",
        scope: "NYC",
        constraints: {
          latency_ms: 50,
          freshness_sec: 10,
        },
        maxPrice: 0.0002,
      },
      directory: [],
      credential_checks: [],
      quotes: [],
      negotiation: {
        strategy: "baseline",
        rounds_used: 1,
        log: [
          {
            round: 0,
            timestamp_ms: 1000,
            decision: {
              type: "start",
              quote_price: 0.0001,
              max_price: 0.0002,
            },
          },
        ],
      },
    };

    // Test accepted outcome
    const acceptedTranscript = {
      ...baseTranscript,
      outcome: { ok: true },
      receipt: {
        receipt_id: "r1",
        intent_id: "test",
        intent_type: "weather.data",
        buyer_agent_id: "b1",
        seller_agent_id: "s1",
        agreed_price: 0.0001,
        fulfilled: true,
        timestamp_ms: 1100,
      },
    };
    const acceptedRow = transcriptToTrainingRow(acceptedTranscript as TranscriptV1);
    expect(acceptedRow!.outcome).toBe("accepted");

    // Test rejected outcome
    const rejectedTranscript = {
      ...baseTranscript,
      outcome: { ok: false, code: "NEGOTIATION_FAILED" },
      negotiation: {
        strategy: "baseline",
        rounds_used: 1,
        log: [
          {
            round: 0,
            timestamp_ms: 1000,
            decision: {
              type: "start",
              quote_price: 0.0003,
              max_price: 0.0002,
            },
          },
          {
            round: 1,
            timestamp_ms: 1100,
            decision: {
              type: "rejected",
              reason: "Quote exceeds max price",
            },
          },
        ],
      },
    };
    const rejectedRow = transcriptToTrainingRow(rejectedTranscript as TranscriptV1);
    expect(rejectedRow!.outcome).toBe("rejected");

    // Test timeout outcome
    const timeoutTranscript = {
      ...baseTranscript,
      outcome: { ok: false, code: "NEGOTIATION_TIMEOUT" },
    };
    const timeoutRow = transcriptToTrainingRow(timeoutTranscript as TranscriptV1);
    expect(timeoutRow!.outcome).toBe("timeout");
  });
});
