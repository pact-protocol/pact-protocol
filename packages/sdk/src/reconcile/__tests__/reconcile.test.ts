/**
 * Reconciliation Tests (D2)
 * 
 * Tests for reconcile() function that reconciles pending settlement handles.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { reconcile } from "../reconcile";
import type { ReconcileInput } from "../types";
import { StripeLikeSettlementProvider } from "../../settlement/stripe_like";
import { MockSettlementProvider } from "../../settlement/mock";
import type { TranscriptV1 } from "../../transcript/types";
import type { SettlementIntent } from "../../settlement/types";

describe("reconcile()", () => {
  let tempDir: string;
  let transcriptPath: string;

  beforeEach(() => {
    // Create temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "reconcile-test-"));
  });

  afterEach(() => {
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("NOOP when no settlement_lifecycle", async () => {
    const transcript: TranscriptV1 = {
      version: "1",
      intent_id: "test-intent-1",
      intent_type: "test",
      timestamp_ms: Date.now(),
      input: {} as any,
      directory: [],
      credential_checks: [],
      quotes: [],
      outcome: { ok: true },
    };

    const settlement = new MockSettlementProvider();
    const input: ReconcileInput = {
      transcript,
      now: () => Date.now(),
      settlement,
    };

    const result = await reconcile(input);
    expect(result.ok).toBe(true);
    expect(result.status).toBe("NOOP");
    expect(result.reason).toContain("No settlement_lifecycle");
    expect(result.reconciledHandles).toEqual([]);
  });

  it("NOOP when no pending handles", async () => {
    const transcript: TranscriptV1 = {
      version: "1",
      intent_id: "test-intent-2",
      intent_type: "test",
      timestamp_ms: Date.now(),
      input: {} as any,
      directory: [],
      credential_checks: [],
      quotes: [],
      outcome: { ok: true },
      settlement_lifecycle: {
        provider: "mock",
        handle_id: "handle-123",
        status: "committed",
        committed_at_ms: Date.now(),
        paid_amount: 0.1,
      },
    };

    const settlement = new MockSettlementProvider();
    const input: ReconcileInput = {
      transcript,
      now: () => Date.now(),
      settlement,
    };

    const result = await reconcile(input);
    expect(result.ok).toBe(true);
    expect(result.status).toBe("NOOP");
    expect(result.reason).toContain("not pending");
    expect(result.reconciledHandles).toEqual([]);
  });

  it("UPDATED when pending -> committed (StripeLikeSettlementProvider async mode)", async () => {
    // Create settlement provider with async mode
    const settlement = new StripeLikeSettlementProvider({
      asyncCommit: true,
      commitDelayTicks: 1, // Resolve after 1 poll
      failCommit: false,
    });
    settlement.setBalance("buyer-1", 1.0);
    settlement.setBalance("seller-1", 0.0);

    // Prepare and commit (returns pending)
    const intent: SettlementIntent = {
      intent_id: "test-intent-3",
      from: "buyer-1",
      to: "seller-1",
      amount: 0.1,
      mode: "hash_reveal",
      idempotency_key: "test-key-3",
    };

    const handle = await settlement.prepare(intent);
    const commitResult = await settlement.commit(handle.handle_id);
    expect(commitResult.status).toBe("pending");

    // Create transcript with pending handle
    const transcript: TranscriptV1 = {
      version: "1",
      intent_id: "test-intent-3",
      intent_type: "test",
      timestamp_ms: Date.now(),
      input: {} as any,
      directory: [],
      credential_checks: [],
      quotes: [],
      outcome: { ok: true },
      settlement_lifecycle: {
        provider: "stripe_like",
        handle_id: handle.handle_id,
        status: "pending",
        prepared_at_ms: Date.now(),
      },
    };

    // Write transcript to temp file
    transcriptPath = path.join(tempDir, "test-transcript.json");
    fs.writeFileSync(transcriptPath, JSON.stringify(transcript, null, 2), "utf-8");

    // Reconcile (should poll once and resolve to committed)
    const now = Date.now();
    const input: ReconcileInput = {
      transcriptPath,
      now: () => now,
      settlement,
    };

    const result = await reconcile(input);
    expect(result.ok).toBe(true);
    expect(result.status).toBe("UPDATED");
    expect(result.updatedTranscriptPath).toBeDefined();
    expect(result.reconciledHandles).toHaveLength(1);
    expect(result.reconciledHandles[0].handle_id).toBe(handle.handle_id);
    expect(result.reconciledHandles[0].status).toBe("committed");

    // Verify updated transcript
    const updatedContent = fs.readFileSync(result.updatedTranscriptPath!, "utf-8");
    const updatedTranscript: TranscriptV1 = JSON.parse(updatedContent);
    expect(updatedTranscript.settlement_lifecycle?.status).toBe("committed");
    expect(updatedTranscript.settlement_lifecycle?.committed_at_ms).toBe(now);
    expect(updatedTranscript.settlement_lifecycle?.paid_amount).toBe(0.1);
    expect(updatedTranscript.reconcile_events).toBeDefined();
    expect(updatedTranscript.reconcile_events).toHaveLength(1);
    expect(updatedTranscript.reconcile_events![0].from_status).toBe("pending");
    expect(updatedTranscript.reconcile_events![0].to_status).toBe("committed");
    expect(updatedTranscript.reconcile_events![0].handle_id).toBe(handle.handle_id);
    expect(updatedTranscript.reconcile_events![0].ts_ms).toBe(now);
    expect(updatedTranscript.reconcile_events![0].note).toContain("paid_amount");

    // Verify filename has "-reconciled-" suffix
    expect(result.updatedTranscriptPath).toContain("-reconciled-");
  });

  it("UPDATED when pending -> failed", async () => {
    // Create settlement provider with async mode that fails
    const settlement = new StripeLikeSettlementProvider({
      asyncCommit: true,
      commitDelayTicks: 1, // Resolve after 1 poll
      failCommit: true, // Will fail
    });
    settlement.setBalance("buyer-1", 1.0);
    settlement.setBalance("seller-1", 0.0);

    // Prepare and commit (returns pending)
    const intent: SettlementIntent = {
      intent_id: "test-intent-4",
      from: "buyer-1",
      to: "seller-1",
      amount: 0.1,
      mode: "hash_reveal",
      idempotency_key: "test-key-4",
    };

    const handle = await settlement.prepare(intent);
    const commitResult = await settlement.commit(handle.handle_id);
    expect(commitResult.status).toBe("pending");

    // Create transcript with pending handle
    const transcript: TranscriptV1 = {
      version: "1",
      intent_id: "test-intent-4",
      intent_type: "test",
      timestamp_ms: Date.now(),
      input: {} as any,
      directory: [],
      credential_checks: [],
      quotes: [],
      outcome: { ok: true },
      settlement_lifecycle: {
        provider: "stripe_like",
        handle_id: handle.handle_id,
        status: "pending",
        prepared_at_ms: Date.now(),
      },
    };

    // Write transcript to temp file
    transcriptPath = path.join(tempDir, "test-transcript-fail.json");
    fs.writeFileSync(transcriptPath, JSON.stringify(transcript, null, 2), "utf-8");

    // Reconcile (should poll once and resolve to failed)
    const now = Date.now();
    const input: ReconcileInput = {
      transcriptPath,
      now: () => now,
      settlement,
    };

    const result = await reconcile(input);
    expect(result.ok).toBe(true);
    expect(result.status).toBe("UPDATED");
    expect(result.updatedTranscriptPath).toBeDefined();
    expect(result.reconciledHandles).toHaveLength(1);
    expect(result.reconciledHandles[0].handle_id).toBe(handle.handle_id);
    expect(result.reconciledHandles[0].status).toBe("failed");

    // Verify updated transcript
    const updatedContent = fs.readFileSync(result.updatedTranscriptPath!, "utf-8");
    const updatedTranscript: TranscriptV1 = JSON.parse(updatedContent);
    expect(updatedTranscript.settlement_lifecycle?.status).toBe("failed");
    expect(updatedTranscript.settlement_lifecycle?.failure_code).toBeDefined();
    expect(updatedTranscript.settlement_lifecycle?.failure_reason).toBeDefined();
    expect(updatedTranscript.reconcile_events).toBeDefined();
    expect(updatedTranscript.reconcile_events).toHaveLength(1);
    expect(updatedTranscript.reconcile_events![0].from_status).toBe("pending");
    expect(updatedTranscript.reconcile_events![0].to_status).toBe("failed");
    expect(updatedTranscript.reconcile_events![0].handle_id).toBe(handle.handle_id);
    expect(updatedTranscript.reconcile_events![0].note).toContain("failed");
  });

  it("NOOP when still pending after poll", async () => {
    // Create settlement provider with async mode that needs more polls
    const settlement = new StripeLikeSettlementProvider({
      asyncCommit: true,
      commitDelayTicks: 3, // Needs 3 polls
      failCommit: false,
    });
    settlement.setBalance("buyer-1", 1.0);
    settlement.setBalance("seller-1", 0.0);

    // Prepare and commit (returns pending)
    const intent: SettlementIntent = {
      intent_id: "test-intent-5",
      from: "buyer-1",
      to: "seller-1",
      amount: 0.1,
      mode: "hash_reveal",
      idempotency_key: "test-key-5",
    };

    const handle = await settlement.prepare(intent);
    const commitResult = await settlement.commit(handle.handle_id);
    expect(commitResult.status).toBe("pending");

    // Create transcript with pending handle
    const transcript: TranscriptV1 = {
      version: "1",
      intent_id: "test-intent-5",
      intent_type: "test",
      timestamp_ms: Date.now(),
      input: {} as any,
      directory: [],
      credential_checks: [],
      quotes: [],
      outcome: { ok: true },
      settlement_lifecycle: {
        provider: "stripe_like",
        handle_id: handle.handle_id,
        status: "pending",
        prepared_at_ms: Date.now(),
      },
    };

    const input: ReconcileInput = {
      transcript,
      now: () => Date.now(),
      settlement,
    };

    // Reconcile (should poll once, still pending)
    const result = await reconcile(input);
    expect(result.ok).toBe(true);
    expect(result.status).toBe("NOOP");
    expect(result.reason).toContain("still pending");
    expect(result.reconciledHandles).toEqual([]);
  });

  it("FAILED when settlement provider does not support poll", async () => {
    // Create a minimal provider that doesn't implement poll
    const settlement = {
      getBalance: () => 0,
      getLocked: () => 0,
      lock: () => {},
      release: () => {},
      pay: () => {},
      slashBond: () => {},
      credit: () => {},
      debit: () => {},
      lockFunds: () => false,
      lockBond: () => false,
      unlock: () => {},
      releaseFunds: () => {},
      slash: () => {},
      streamTick: () => false,
      prepare: async () => ({ handle_id: "", intent_id: "", status: "prepared" as const, locked_amount: 0, created_at_ms: 0 }),
      commit: async () => ({ ok: true, status: "committed" as const, paid_amount: 0, handle_id: "" }),
      abort: async () => {},
      // poll is intentionally not implemented
    } as any;

    const transcript: TranscriptV1 = {
      version: "1",
      intent_id: "test-intent-6",
      intent_type: "test",
      timestamp_ms: Date.now(),
      input: {} as any,
      directory: [],
      credential_checks: [],
      quotes: [],
      outcome: { ok: true },
      settlement_lifecycle: {
        provider: "mock",
        handle_id: "handle-123",
        status: "pending",
        prepared_at_ms: Date.now(),
      },
    };

    const input: ReconcileInput = {
      transcript,
      now: () => Date.now(),
      settlement,
    };

    const result = await reconcile(input);
    expect(result.ok).toBe(false);
    expect(result.status).toBe("FAILED");
    expect(result.reason).toContain("does not support poll");
    expect(result.reconciledHandles).toEqual([]);
  });

  it("FAILED when transcript file not found", async () => {
    const settlement = new MockSettlementProvider();
    const input: ReconcileInput = {
      transcriptPath: "/nonexistent/path/transcript.json",
      now: () => Date.now(),
      settlement,
    };

    const result = await reconcile(input);
    expect(result.ok).toBe(false);
    expect(result.status).toBe("FAILED");
    expect(result.reason).toContain("Failed to load transcript");
    expect(result.reconciledHandles).toEqual([]);
  });

  it("FAILED when neither transcriptPath nor transcript provided", async () => {
    const settlement = new MockSettlementProvider();
    const input: ReconcileInput = {
      now: () => Date.now(),
      settlement,
    };

    const result = await reconcile(input);
    expect(result.ok).toBe(false);
    expect(result.status).toBe("FAILED");
    expect(result.reason).toContain("Either transcriptPath or transcript must be provided");
    expect(result.reconciledHandles).toEqual([]);
  });
});

