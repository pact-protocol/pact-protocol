/**
 * Central EventRunner for acquire() phase/event pipeline
 * 
 * Provides centralized event emission, retry logic, idempotency checks,
 * and failure mapping while maintaining transcript ordering.
 */

import type {
  AcquisitionEvent,
  AcquisitionPhase,
  EventContext,
  EventEvidence,
  EventHandler,
  FailureEvent,
  ProgressEvent,
  SuccessEvent,
} from "./events";

/**
 * EventRunner manages event emission, retry logic, and idempotency
 */
export class EventRunner {
  private context: EventContext;
  private idempotencyStore: Map<string, AcquisitionEvent> = new Map();

  constructor(intentId: string, startMs: number) {
    this.context = {
      intent_id: intentId,
      start_ms: startMs,
      sequence: 0,
      handlers: [],
      evidence: [],
      history: [],
    };
  }

  /**
   * Register an event handler
   */
  on(handler: EventHandler): void {
    this.context.handlers.push(handler);
  }

  /**
   * Emit an event (centralized emission point)
   * 
   * Event IDs are deterministic: same intent_id + sequence = same event_id
   * This ensures idempotency: same input → same event IDs
   */
  async emitEvent(event: Omit<AcquisitionEvent, "event_id" | "sequence">): Promise<AcquisitionEvent> {
    const sequence = this.context.sequence++;
    // Event ID is deterministic: intent_id + sequence number
    // Same input (intent_id + phase order) → same event IDs
    const event_id = `${this.context.intent_id}-${sequence}`;

    const fullEvent: AcquisitionEvent = {
      ...event,
      event_id,
      sequence,
      timestamp_ms: event.timestamp_ms,
      intent_id: this.context.intent_id,
    };

    // Check idempotency (if event_id already processed, return stored result)
    if (this.idempotencyStore.has(event_id)) {
      return this.idempotencyStore.get(event_id)!;
    }

    // Store event for idempotency
    this.idempotencyStore.set(event_id, fullEvent);

    // Add to history
    this.context.history.push(fullEvent);

    // Attach evidence if provided
    if (event.evidence) {
      this.context.evidence.push(...event.evidence);
    }

    // Call all registered handlers
    for (const handler of this.context.handlers) {
      try {
        await handler(fullEvent);
      } catch (error) {
        // Handler errors should not break the pipeline
        // Log but continue
        console.error(`Event handler error for ${event_id}:`, error);
      }
    }

    return fullEvent;
  }

  /**
   * Emit a success event
   */
  async emitSuccess(
    phase: AcquisitionPhase,
    result: Record<string, unknown>,
    evidence?: EventEvidence[]
  ): Promise<SuccessEvent> {
    const now = Date.now();
    return (await this.emitEvent({
      type: "success",
      phase,
      timestamp_ms: now,
      result,
      evidence,
    })) as SuccessEvent;
  }

  /**
   * Emit a failure event
   */
  async emitFailure(
    phase: AcquisitionPhase,
    failure_code: string,
    failure_reason: string,
    retryable: boolean,
    metadata?: Record<string, unknown>,
    evidence?: EventEvidence[]
  ): Promise<FailureEvent> {
    const now = Date.now();
    return (await this.emitEvent({
      type: "failure",
      phase,
      timestamp_ms: now,
      failure_code,
      failure_reason,
      retryable,
      metadata,
      evidence,
    })) as FailureEvent;
  }

  /**
   * Emit a progress event
   */
  async emitProgress(
    phase: AcquisitionPhase,
    progress: number,
    message: string,
    checkpoint?: Record<string, unknown>,
    evidence?: EventEvidence[]
  ): Promise<ProgressEvent> {
    const now = Date.now();
    return (await this.emitEvent({
      type: "progress",
      phase,
      timestamp_ms: now,
      progress,
      message,
      checkpoint,
      evidence,
    })) as ProgressEvent;
  }

  /**
   * Get current context
   */
  getContext(): Readonly<EventContext> {
    return { ...this.context };
  }

  /**
   * Get evidence collected so far
   */
  getEvidence(): Readonly<EventEvidence[]> {
    return [...this.context.evidence];
  }

  /**
   * Get event history
   */
  getHistory(): Readonly<AcquisitionEvent[]> {
    return [...this.context.history];
  }

  /**
   * Check if an event ID has been processed (idempotency check)
   */
  isProcessed(eventId: string): boolean {
    return this.idempotencyStore.has(eventId);
  }

  /**
   * Get processed event by ID (for idempotency)
   */
  getProcessedEvent(eventId: string): AcquisitionEvent | undefined {
    return this.idempotencyStore.get(eventId);
  }
}

/**
 * Failure mapping: determines if a failure code is retryable
 * This centralizes the retry logic previously scattered in acquire()
 */
export function isRetryableFailureCode(failure_code: string): boolean {
  // Non-retryable failures (policy, protocol, identity issues)
  const nonRetryable = [
    "INVALID_POLICY",
    "ZK_KYA_REQUIRED",
    "ZK_KYA_EXPIRED",
    "ZK_KYA_INVALID",
    "ZK_KYA_ISSUER_NOT_ALLOWED",
    "ZK_KYA_TIER_TOO_LOW",
    "NO_PROVIDERS",
    "NO_ELIGIBLE_PROVIDERS",
    "PROVIDER_MISSING_REQUIRED_CREDENTIALS",
    "PROVIDER_UNTRUSTED_ISSUER",
    "PROVIDER_TRUST_TIER_TOO_LOW",
    "PROVIDER_TRUST_SCORE_TOO_LOW",
    "PROVIDER_CREDENTIAL_REQUIRED",
    "PROVIDER_QUOTE_POLICY_REJECTED",
    "PROVIDER_QUOTE_OUT_OF_BAND",
    "NEGOTIATION_FAILED",
    "NO_AGREEMENT",
    "FAILED_PROOF",
    "NO_RECEIPT",
    "WALLET_PROOF_FAILED",
  ];

  if (nonRetryable.includes(failure_code)) {
    return false;
  }

  // Retryable failures (settlement, network, provider-specific issues)
  const retryable = [
    "SETTLEMENT_FAILED",
    "SETTLEMENT_PROVIDER_NOT_IMPLEMENTED",
    "HTTP_PROVIDER_ERROR",
    "HTTP_STREAMING_ERROR",
    "PROVIDER_QUOTE_HTTP_ERROR",
    "PROVIDER_SIGNATURE_INVALID",
    "PROVIDER_SIGNER_MISMATCH",
    "INVALID_MESSAGE_TYPE",
    "SETTLEMENT_POLL_TIMEOUT",
    "STREAMING_NOT_CONFIGURED",
  ];

  if (retryable.includes(failure_code)) {
    return true;
  }

  // Default: treat unknown failures as retryable (conservative)
  return true;
}

/**
 * Create evidence from phase and data
 */
export function createEvidence(
  phase: AcquisitionPhase,
  evidence_type: string,
  data: Record<string, unknown>,
  timestamp_ms?: number
): EventEvidence {
  return {
    phase,
    timestamp_ms: timestamp_ms ?? Date.now(),
    evidence_type,
    data,
  };
}
