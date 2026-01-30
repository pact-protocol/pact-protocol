/**
 * Memory-based Passport Storage (for testing)
 * 
 * Pure JavaScript implementation that matches PassportStorage interface
 * but uses in-memory data structures instead of SQLite.
 * 
 * This allows credit tests to run without requiring better-sqlite3 native bindings.
 */

import type { PassportEvent, PassportScore } from "./types";

export class MemoryPassportStorage {
  private agents: Map<string, { agent_id: string; created_at: number; identity_snapshot_hash: string }> = new Map();
  private events: PassportEvent[] = [];
  private scores: Map<string, PassportScore> = new Map();
  private creditAccounts: Map<string, { agent_id: string; tier: "A" | "B" | "C"; updated_at: number; disabled_until: number | null; reason: string | null }> = new Map();
  private creditExposure: Map<string, { agent_id: string; outstanding_usd: number; per_counterparty_json: string; updated_at: number }> = new Map();
  private creditEvents: Array<{ id: number; agent_id: string; ts: number; transcript_hash: string; delta_usd: number; counterparty_agent_id: string | null; reason_code: string }> = [];
  private nextEventId = 1;
  private nextCreditEventId = 1;

  constructor(_dbPath: string) {
    // Memory storage doesn't need a db path, but we accept it for interface compatibility
  }

  /**
   * Upsert agent record.
   */
  upsertAgent(agentId: string, identitySnapshotHash: string, createdAt: number): void {
    this.agents.set(agentId, {
      agent_id: agentId,
      created_at: createdAt,
      identity_snapshot_hash: identitySnapshotHash,
    });
  }

  /**
   * Insert passport event (idempotent on transcript_hash + agent_id).
   */
  insertEvent(event: Omit<PassportEvent, "id">): boolean {
    // Check if already exists (idempotency)
    const exists = this.events.some(
      e => e.transcript_hash === event.transcript_hash && e.agent_id === event.agent_id
    );
    if (exists) {
      return false; // Already exists
    }

    // Add event
    this.events.push({
      ...event,
      id: this.nextEventId++,
    });
    return true; // Inserted
  }

  /**
   * Upsert passport score.
   */
  upsertScore(score: PassportScore): void {
    this.scores.set(score.agent_id, score);
  }

  /**
   * Check if transcript_hash + agent_id combination already exists (for idempotency).
   */
  hasTranscriptHash(transcriptHash: string, agentId?: string): boolean {
    if (agentId) {
      return this.events.some(
        e => e.transcript_hash === transcriptHash && e.agent_id === agentId
      );
    } else {
      return this.events.some(e => e.transcript_hash === transcriptHash);
    }
  }

  /**
   * Get all events for an agent (for testing/debugging).
   */
  getEventsByAgent(agentId: string): PassportEvent[] {
    return this.events
      .filter(e => e.agent_id === agentId)
      .sort((a, b) => a.ts - b.ts);
  }

  /**
   * Get score for an agent (for testing/debugging).
   */
  getScore(agentId: string): PassportScore | null {
    return this.scores.get(agentId) || null;
  }

  /**
   * Get event count by type (for testing).
   */
  getEventCounts(): { event_type: string; count: number }[] {
    const counts: Map<string, number> = new Map();
    for (const event of this.events) {
      counts.set(event.event_type, (counts.get(event.event_type) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([event_type, count]) => ({ event_type, count }));
  }

  /**
   * Upsert credit account.
   */
  upsertCreditAccount(
    agentId: string,
    tier: "A" | "B" | "C",
    updatedAt: number,
    disabledUntil?: number | null,
    reason?: string | null
  ): void {
    this.creditAccounts.set(agentId, {
      agent_id: agentId,
      tier,
      updated_at: updatedAt,
      disabled_until: disabledUntil ?? null,
      reason: reason ?? null,
    });
  }

  /**
   * Get credit account.
   */
  getCreditAccount(agentId: string): {
    agent_id: string;
    tier: "A" | "B" | "C";
    updated_at: number;
    disabled_until: number | null;
    reason: string | null;
  } | null {
    return this.creditAccounts.get(agentId) || null;
  }

  /**
   * Upsert credit exposure.
   */
  upsertCreditExposure(
    agentId: string,
    outstandingUsd: number,
    perCounterpartyJson: string,
    updatedAt: number
  ): void {
    this.creditExposure.set(agentId, {
      agent_id: agentId,
      outstanding_usd: outstandingUsd,
      per_counterparty_json: perCounterpartyJson,
      updated_at: updatedAt,
    });
  }

  /**
   * Get credit exposure.
   */
  getCreditExposure(agentId: string): {
    agent_id: string;
    outstanding_usd: number;
    per_counterparty_json: string;
    updated_at: number;
  } | null {
    return this.creditExposure.get(agentId) || null;
  }

  /**
   * Insert credit event (idempotent on transcript_hash + agent_id).
   */
  insertCreditEvent(event: {
    agent_id: string;
    ts: number;
    transcript_hash: string;
    delta_usd: number;
    counterparty_agent_id: string | null;
    reason_code: string;
  }): boolean {
    // Check if already exists (idempotency)
    const exists = this.creditEvents.some(
      e => e.transcript_hash === event.transcript_hash && e.agent_id === event.agent_id
    );
    if (exists) {
      return false; // Already exists
    }

    // Add credit event
    this.creditEvents.push({
      ...event,
      id: this.nextCreditEventId++,
    });
    return true; // Inserted
  }

  /**
   * Get credit events for an agent (for testing/debugging).
   */
  getCreditEventsByAgent(agentId: string): Array<{
    id: number;
    agent_id: string;
    ts: number;
    transcript_hash: string;
    delta_usd: number;
    counterparty_agent_id: string | null;
    reason_code: string;
  }> {
    return this.creditEvents
      .filter(e => e.agent_id === agentId)
      .sort((a, b) => a.ts - b.ts);
  }

  /**
   * Check if credit event exists for transcript_hash (idempotency check).
   */
  hasCreditEvent(transcriptHash: string, agentId?: string): boolean {
    if (agentId) {
      return this.creditEvents.some(
        e => e.transcript_hash === transcriptHash && e.agent_id === agentId
      );
    } else {
      return this.creditEvents.some(e => e.transcript_hash === transcriptHash);
    }
  }

  /**
   * Get recent failure events for kill switch checks.
   */
  getRecentFailures(
    agentId: string,
    windowMs: number,
    failureCodePattern?: string
  ): Array<{
    transcript_hash: string;
    failure_code: string | null;
    ts: number;
    fault_domain: string | null;
  }> {
    const now = Date.now();
    const cutoff = now - windowMs;

    let filtered = this.events.filter(
      e =>
        e.agent_id === agentId &&
        e.event_type === "settlement_failure" &&
        e.ts >= cutoff
    );

    if (failureCodePattern) {
      // SQL LIKE pattern matching: "PACT-1%" matches "PACT-101", "PACT-102", etc.
      const pattern = failureCodePattern.replace(/%/g, ".*");
      const regex = new RegExp(`^${pattern}$`);
      filtered = filtered.filter(
        e => e.failure_code && regex.test(e.failure_code)
      );
    }

    return filtered
      .sort((a, b) => b.ts - a.ts)
      .map(e => ({
        transcript_hash: e.transcript_hash,
        failure_code: e.failure_code,
        ts: e.ts,
        fault_domain: e.fault_domain,
      }));
  }

  /**
   * Get recent dispute outcomes for kill switch checks.
   */
  getRecentDisputes(
    agentId: string,
    windowMs: number,
    outcome?: string
  ): Array<{
    transcript_hash: string;
    dispute_outcome: string | null;
    ts: number;
  }> {
    const now = Date.now();
    const cutoff = now - windowMs;

    let filtered = this.events.filter(
      e =>
        e.agent_id === agentId &&
        e.event_type === "dispute_resolved" &&
        e.ts >= cutoff
    );

    if (outcome) {
      filtered = filtered.filter(e => e.dispute_outcome === outcome);
    }

    return filtered
      .sort((a, b) => b.ts - a.ts)
      .map(e => ({
        transcript_hash: e.transcript_hash,
        dispute_outcome: e.dispute_outcome,
        ts: e.ts,
      }));
  }

  /**
   * Close database connection (no-op for memory storage).
   */
  close(): void {
    // No-op for memory storage
  }
}
