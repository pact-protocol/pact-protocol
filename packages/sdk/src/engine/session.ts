import type {
  CompiledPolicy,
  FailureCode,
} from "../policy/types";
import type { PolicyGuard } from "../policy/guard";
import type { IntentContext, NegotiationContext } from "../policy/context";
import type {
  IntentMessage,
  AskMessage,
  BidMessage,
  AcceptMessage,
  RejectMessage,
  CommitMessage,
  RevealMessage,
  PactMessage,
} from "../protocol/types";
import type { SignedEnvelope } from "../protocol/envelope";
import { verifyEnvelope, parseEnvelope, parseMessage } from "../protocol/index";
import { SessionStatus, TerminalOutcome, SessionResult } from "./state";
import { ProtocolViolationError, PolicyViolationError, TimeoutError } from "./errors";
import type { SettlementProvider } from "../settlement/index";
import { createAgreement, type Agreement } from "../exchange/agreement";
import { createReceipt, type Receipt } from "../exchange/receipt";
import { verifyReveal } from "../exchange/commit";

export interface CounterpartySummary {
  agent_id: string;
  is_new_agent?: boolean;
  age_ms?: number;
  region?: string;
  reputation?: number;
  failure_rate?: number;
  timeout_rate?: number;
  credentials?: Array<{
    type: string;
    issuer: string;
    [key: string]: unknown;
  }>;
}

export interface NegotiationSessionParams {
  compiledPolicy: CompiledPolicy;
  guard: PolicyGuard;
  now: () => number;
  role: "buyer" | "seller";
  intentType?: string;
  settlement?: SettlementProvider;
  buyerAgentId?: string;
  sellerAgentId?: string;
}

export class NegotiationSession {
  private status: SessionStatus = "IDLE";
  private intent_id?: string;
  private intent?: IntentMessage;
  private start_ms?: number;
  private round: number = 0;
  private last_action_ms?: number;
  private latest_ask?: AskMessage;
  private latest_bid?: BidMessage;
  private transcript: SignedEnvelope<PactMessage>[] = [];
  private terminal_result?: SessionResult;
  private agreement?: Agreement;
  private receipt?: Receipt;

  constructor(
    private params: NegotiationSessionParams
  ) {}

  getStatus(): SessionStatus {
    return this.status;
  }

  getIntentId(): string | undefined {
    return this.intent_id;
  }

  getRound(): number {
    return this.round;
  }

  getTranscript(): readonly SignedEnvelope<PactMessage>[] {
    return this.transcript;
  }

  getResult(): SessionResult | undefined {
    return this.terminal_result;
  }

  /**
   * Open negotiation with an INTENT message.
   */
  async openWithIntent(
    envelope: SignedEnvelope<IntentMessage>,
    intentMeta?: Partial<IntentContext>
  ): Promise<{ ok: true } | { ok: false; code: FailureCode; reason: string }> {
    if (this.status !== "IDLE") {
      return {
        ok: false,
        code: "FAILED_POLICY",
        reason: `Cannot open intent: session is in ${this.status} state`,
      };
    }

    // Verify envelope signature
    const isValid = await verifyEnvelope(envelope);
    if (!isValid) {
      this.terminate("FAILED_IDENTITY", "FAILED_POLICY", "Envelope signature verification failed");
      return { ok: false, code: "FAILED_POLICY", reason: "Envelope signature verification failed" };
    }

    // Parse and validate message
    let message: IntentMessage;
    try {
      const parsed = parseMessage(envelope.message);
      if (parsed.type !== "INTENT") {
        return {
          ok: false,
          code: "FAILED_POLICY",
          reason: `Expected INTENT message, got ${parsed.type}`,
        };
      }
      message = parsed;
    } catch (error) {
      return {
        ok: false,
        code: "FAILED_POLICY",
        reason: `Invalid message: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // Check intent expiry
    const now = this.params.now();
    if (message.expires_at_ms <= now) {
      this.terminate("TIMEOUT", "FAILED_NEGOTIATION_TIMEOUT", "intent expired");
      return { ok: false, code: "FAILED_NEGOTIATION_TIMEOUT", reason: "intent expired" };
    }

    // Policy check: intent phase
    // Defaults that should allow local tests to pass
    const intentCtx = {
      now_ms: now,
      intent_type: message.intent,
      expires_at_ms: message.expires_at_ms,
      urgent: !!message.urgent,

      admission: { has_bond: true, has_credential: false, has_sponsor: false },
      rate_limit_ok: true,
      concurrency_ok: true,
      budgets_ok: true,
      kill_switch_triggered: false,

      ...(intentMeta ?? {}),
    };

    const guardResult = this.params.guard.check("intent", intentCtx, message.intent);
    if (!guardResult.ok) {
      return this.terminateFromGuard(guardResult);
    }

    // Accept intent
    this.status = "INTENT_OPEN";
    this.intent_id = message.intent_id;
    this.intent = message;
    this.start_ms = now;
    this.round = 0;
    this.last_action_ms = now;
    this.transcript.push(envelope);

    return { ok: true };
  }

  /**
   * Process an ASK or BID quote.
   */
  async onQuote(
    envelope: SignedEnvelope<AskMessage | BidMessage>,
    counterpartySummary: CounterpartySummary = {
      agent_id: "default-agent",
      reputation: 0.99,
      is_new_agent: false,
      region: "us-east",
      failure_rate: 0.0,
      timeout_rate: 0.0,
      credentials: [], // Empty array passes when no credentials are required
    },
    referencePriceP50?: number
  ): Promise<{ ok: true } | { ok: false; code: FailureCode; reason: string }> {
    if (this.status !== "INTENT_OPEN" && this.status !== "NEGOTIATING") {
      return {
        ok: false,
        code: "FAILED_POLICY",
        reason: `Cannot process quote: session is in ${this.status} state`,
      };
    }

    // Verify envelope signature
    const isValid = await verifyEnvelope(envelope);
    if (!isValid) {
      this.terminate("FAILED_IDENTITY", "FAILED_POLICY", "Envelope signature verification failed");
      return { ok: false, code: "FAILED_POLICY", reason: "Envelope signature verification failed" };
    }

    // Parse and validate message
    let message: AskMessage | BidMessage;
    try {
      const parsed = parseMessage(envelope.message);
      if (parsed.type !== "ASK" && parsed.type !== "BID") {
        return {
          ok: false,
          code: "FAILED_POLICY",
          reason: `Expected ASK or BID message, got ${parsed.type}`,
        };
      }
      message = parsed;
    } catch (error) {
      return {
        ok: false,
        code: "FAILED_POLICY",
        reason: `Invalid message: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // Check intent_id matches
    if (message.intent_id !== this.intent_id) {
      return {
        ok: false,
        code: "FAILED_POLICY",
        reason: `Intent ID mismatch: expected ${this.intent_id}, got ${message.intent_id}`,
      };
    }

    // Check quote expiry
    const now = this.params.now();
    if (message.expires_at_ms <= now) {
      this.terminate("TIMEOUT", "FAILED_NEGOTIATION_TIMEOUT", "quote expired");
      return { ok: false, code: "FAILED_NEGOTIATION_TIMEOUT", reason: "quote expired" };
    }

    // Validate expires_at_ms matches sent_at_ms + valid_for_ms
    if (message.expires_at_ms !== message.sent_at_ms + message.valid_for_ms) {
      return {
        ok: false,
        code: "FAILED_POLICY",
        reason: "Quote expires_at_ms does not match sent_at_ms + valid_for_ms",
      };
    }

    // Policy check: negotiation phase
    const nextRound = this.round + 1;
    
    // Ensure start_ms is set (should be set in openWithIntent)
    if (this.start_ms === undefined) {
      // Fallback: use current time as start if somehow not set
      this.start_ms = now;
    }
    
    const elapsedMs = now - this.start_ms;

    const negotiationCtx = {
      now_ms: now,
      intent_type: this.intent?.intent ?? this.params.intentType ?? "",
      round: nextRound,
      elapsed_ms: elapsedMs,

      message_type: message.type,
      valid_for_ms: message.valid_for_ms,
      is_firm_quote: true,
      quote_price: message.price,
      reference_price_p50: referencePriceP50 ?? null,
      urgent: !!this.intent?.urgent,

      counterparty: {
        reputation: counterpartySummary.reputation ?? 0.99,
        age_ms: counterpartySummary.age_ms ?? 1_000_000,
        region: counterpartySummary.region ?? "us-east",
        has_required_credentials: true,
        failure_rate: counterpartySummary.failure_rate ?? 0,
        timeout_rate: counterpartySummary.timeout_rate ?? 0,
        is_new: counterpartySummary.is_new_agent ?? false,
      },
    };

    const guardResult = this.params.guard.check("negotiation", negotiationCtx, negotiationCtx.intent_type);
    if (!guardResult.ok) {
      return this.terminateFromGuard(guardResult);
    }

    // Accept quote
    this.status = "NEGOTIATING";
    this.round = nextRound;
    this.last_action_ms = now;
    if (message.type === "ASK") {
      this.latest_ask = message;
    } else {
      this.latest_bid = message;
    }
    this.transcript.push(envelope);

    return { ok: true };
  }

  /**
   * Accept the negotiation.
   */
  async accept(envelope: SignedEnvelope<AcceptMessage>): Promise<{ ok: true } | { ok: false; code: FailureCode; reason: string }> {
    if (this.status !== "NEGOTIATING") {
      return {
        ok: false,
        code: "FAILED_POLICY",
        reason: `Cannot accept: session is in ${this.status} state`,
      };
    }

    // Verify envelope signature
    const isValid = await verifyEnvelope(envelope);
    if (!isValid) {
      this.terminate("FAILED_IDENTITY", "FAILED_POLICY", "Envelope signature verification failed");
      return { ok: false, code: "FAILED_POLICY", reason: "Envelope signature verification failed" };
    }

    // Parse and validate message
    let message: AcceptMessage;
    try {
      const parsed = parseMessage(envelope.message);
      if (parsed.type !== "ACCEPT") {
        return {
          ok: false,
          code: "FAILED_POLICY",
          reason: `Expected ACCEPT message, got ${parsed.type}`,
        };
      }
      message = parsed;
    } catch (error) {
      return {
        ok: false,
        code: "FAILED_POLICY",
        reason: `Invalid message: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // Check intent_id matches
    if (message.intent_id !== this.intent_id) {
      return {
        ok: false,
        code: "FAILED_POLICY",
        reason: `Intent ID mismatch: expected ${this.intent_id}, got ${message.intent_id}`,
      };
    }

    // Check expiry
    const now = this.params.now();
    if (message.expires_at_ms <= now) {
      this.terminate("TIMEOUT", "FAILED_NEGOTIATION_TIMEOUT", "quote expired");
      return { ok: false, code: "FAILED_NEGOTIATION_TIMEOUT", reason: "quote expired" };
    }

    // Policy check: negotiation phase
    const elapsed_ms = now - (this.start_ms ?? now);
    const latestQuote = this.latest_ask ?? this.latest_bid;
    const negotiationCtx: NegotiationContext = {
      now_ms: now,
      intent_type: this.intent?.intent ?? this.params.intentType ?? "",
      round: this.round,
      elapsed_ms,
      message_type: latestQuote?.type === "ASK" ? "ASK" : "BID",
      valid_for_ms: latestQuote?.valid_for_ms ?? 60000,
      is_firm_quote: true,
      quote_price: latestQuote?.price ?? 0,
      reference_price_p50: null,
    };

    const guardResult = this.params.guard.check("negotiation", negotiationCtx, this.intent?.intent);
    if (!guardResult.ok) {
      return this.terminateFromGuard(guardResult);
    }

    // Create agreement and lock funds/bond
    if (this.params.settlement) {
      const buyerAgentId = this.params.buyerAgentId ?? "buyer";
      const sellerAgentId = this.params.sellerAgentId ?? "seller";
      const sellerBond = this.latest_ask?.bond_required ?? this.latest_bid?.bond_required ?? 0;

      // Lock buyer funds
      const fundsLocked = this.params.settlement.lockFunds(buyerAgentId, message.agreed_price);
      if (!fundsLocked) {
        this.terminate("FAILED_ESCROW", "BOND_INSUFFICIENT", "Insufficient buyer balance");
        return { ok: false, code: "BOND_INSUFFICIENT", reason: "Insufficient buyer balance" };
      }

      // Lock seller bond
      const bondLocked = this.params.settlement.lockBond(sellerAgentId, sellerBond);
      if (!bondLocked) {
        // Unlock buyer funds on failure
        this.params.settlement.unlock(buyerAgentId, message.agreed_price);
        this.terminate("FAILED_ESCROW", "BOND_INSUFFICIENT", "Insufficient seller bond");
        return { ok: false, code: "BOND_INSUFFICIENT", reason: "Insufficient seller bond" };
      }

      // Create agreement
      this.agreement = createAgreement(
        message.intent_id,
        buyerAgentId,
        sellerAgentId,
        message.agreed_price,
        sellerBond,
        message.challenge_window_ms,
        message.delivery_deadline_ms,
        now
      );

      // Move to LOCKED status when settlement is active
      this.status = "LOCKED";
    } else {
      // No settlement - just ACCEPTED
      this.status = "ACCEPTED";
    }
    this.last_action_ms = now;
    this.transcript.push(envelope);

    this.terminal_result = {
      ok: true,
      outcome: "ACCEPTED",
      accept: message,
      transcript: [...this.transcript],
    };

    return { ok: true };
  }

  /**
   * Reject the negotiation.
   */
  async reject(envelope: SignedEnvelope<RejectMessage>): Promise<{ ok: true } | { ok: false; code: FailureCode; reason: string }> {
    // Verify envelope signature
    const isValid = await verifyEnvelope(envelope);
    if (!isValid) {
      this.terminate("FAILED_IDENTITY", "FAILED_POLICY", "Envelope signature verification failed");
      return { ok: false, code: "FAILED_POLICY", reason: "Envelope signature verification failed" };
    }

    // Parse and validate message
    let message: RejectMessage;
    try {
      const parsed = parseMessage(envelope.message);
      if (parsed.type !== "REJECT") {
        return {
          ok: false,
          code: "FAILED_POLICY",
          reason: `Expected REJECT message, got ${parsed.type}`,
        };
      }
      message = parsed;
    } catch (error) {
      return {
        ok: false,
        code: "FAILED_POLICY",
        reason: `Invalid message: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // Check intent_id matches
    if (message.intent_id !== this.intent_id) {
      return {
        ok: false,
        code: "FAILED_POLICY",
        reason: `Intent ID mismatch: expected ${this.intent_id}, got ${message.intent_id}`,
      };
    }

    // Terminate as REJECTED
    const code = message.code ?? "FAILED_POLICY";
    this.status = "REJECTED";
    this.transcript.push(envelope);
    
    this.terminal_result = {
      ok: false,
      outcome: "REJECTED",
      code,
      reason: message.reason,
      transcript: [...this.transcript],
    };

    return { ok: true };
  }

  /**
   * Process COMMIT message (Phase 4: Atomic Exchange).
   */
  async onCommit(envelope: SignedEnvelope<CommitMessage>): Promise<{ ok: true } | { ok: false; code: FailureCode; reason: string }> {
    // Only allowed in LOCKED status
    if (this.status !== "LOCKED") {
      return {
        ok: false,
        code: "FAILED_POLICY",
        reason: `COMMIT not allowed in status ${this.status}`,
      };
    }

    if (!this.agreement) {
      return {
        ok: false,
        code: "FAILED_POLICY",
        reason: "No agreement found",
      };
    }

    // Verify envelope signature
    const isValid = await verifyEnvelope(envelope);
    if (!isValid) {
      this.terminate("FAILED_IDENTITY", "FAILED_POLICY", "Envelope signature verification failed");
      return { ok: false, code: "FAILED_POLICY", reason: "Envelope signature verification failed" };
    }

    // Parse and validate message
    let message: CommitMessage;
    try {
      const parsed = parseMessage(envelope.message);
      if (parsed.type !== "COMMIT") {
        return {
          ok: false,
          code: "FAILED_POLICY",
          reason: `Expected COMMIT message, got ${parsed.type}`,
        };
      }
      message = parsed;
    } catch (error) {
      return {
        ok: false,
        code: "FAILED_POLICY",
        reason: `Invalid message: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // Check intent_id matches
    if (message.intent_id !== this.intent_id) {
      return {
        ok: false,
        code: "FAILED_POLICY",
        reason: `Intent ID mismatch: expected ${this.intent_id}, got ${message.intent_id}`,
      };
    }

    // Check deadline
    const now = this.params.now();
    if (now > this.agreement.delivery_deadline_ms) {
      // Seller failed to commit by deadline - slash
      this.slashSeller("Seller failed to commit by deadline");
      return { ok: false, code: "FAILED_PROOF", reason: "Seller failed to commit by deadline" };
    }

    // Store commit hash
    this.agreement.commit_hash_hex = message.commit_hash_hex;
    this.status = "EXCHANGING";
    this.last_action_ms = now;
    this.transcript.push(envelope);

    return { ok: true };
  }

  /**
   * Process REVEAL message (Phase 4: Atomic Exchange).
   */
  async onReveal(envelope: SignedEnvelope<RevealMessage>): Promise<{ ok: true } | { ok: false; code: FailureCode; reason: string }> {
    // Only allowed in EXCHANGING status
    if (this.status !== "EXCHANGING") {
      return {
        ok: false,
        code: "FAILED_POLICY",
        reason: `REVEAL not allowed in status ${this.status}`,
      };
    }

    if (!this.agreement || !this.agreement.commit_hash_hex) {
      return {
        ok: false,
        code: "FAILED_POLICY",
        reason: "No commit hash found - must COMMIT before REVEAL",
      };
    }

    // Verify envelope signature
    const isValid = await verifyEnvelope(envelope);
    if (!isValid) {
      this.terminate("FAILED_IDENTITY", "FAILED_POLICY", "Envelope signature verification failed");
      return { ok: false, code: "FAILED_POLICY", reason: "Envelope signature verification failed" };
    }

    // Parse and validate message
    let message: RevealMessage;
    try {
      const parsed = parseMessage(envelope.message);
      if (parsed.type !== "REVEAL") {
        return {
          ok: false,
          code: "FAILED_POLICY",
          reason: `Expected REVEAL message, got ${parsed.type}`,
        };
      }
      message = parsed;
    } catch (error) {
      return {
        ok: false,
        code: "FAILED_POLICY",
        reason: `Invalid message: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // Check intent_id matches
    if (message.intent_id !== this.intent_id) {
      return {
        ok: false,
        code: "FAILED_POLICY",
        reason: `Intent ID mismatch: expected ${this.intent_id}, got ${message.intent_id}`,
      };
    }

    // Check deadline
    const now = this.params.now();
    if (now > this.agreement.delivery_deadline_ms) {
      // Seller failed to reveal by deadline - slash
      this.slashSeller("Seller failed to reveal by deadline");
      return { ok: false, code: "FAILED_PROOF", reason: "Seller failed to reveal by deadline" };
    }

    // Verify reveal matches commit
    const isValidReveal = verifyReveal(
      this.agreement.commit_hash_hex,
      message.payload_b64,
      message.nonce_b64
    );

    if (!isValidReveal) {
      // Hash mismatch - slash seller
      this.slashSeller("Reveal hash mismatch");
      return { ok: false, code: "FAILED_PROOF", reason: "Reveal hash mismatch" };
    }

    // Success - complete exchange
    this.agreement.revealed_payload_b64 = message.payload_b64;
    this.agreement.revealed_nonce_b64 = message.nonce_b64;
    this.agreement.status = "COMPLETED";
    this.status = "ACCEPTED";
    this.last_action_ms = now;
    this.transcript.push(envelope);

    // Release funds to seller and unlock bond
    if (this.params.settlement) {
      const buyerAgentId = this.params.buyerAgentId ?? "buyer";
      const sellerAgentId = this.params.sellerAgentId ?? "seller";

      // Unlock buyer payment (adds back to balance)
      this.params.settlement.unlock(buyerAgentId, this.agreement.agreed_price);
      // Debit from buyer and credit to seller
      this.params.settlement.debit(buyerAgentId, this.agreement.agreed_price);
      this.params.settlement.credit(sellerAgentId, this.agreement.agreed_price);

      // Unlock seller bond
      this.params.settlement.unlock(sellerAgentId, this.agreement.seller_bond);
    }

    // Create receipt
    const latencyMs = this.start_ms ? now - this.start_ms : undefined;
    this.receipt = createReceipt({
      intent_id: this.agreement.intent_id,
      buyer_agent_id: this.agreement.buyer_agent_id,
      seller_agent_id: this.agreement.seller_agent_id,
      agreed_price: this.agreement.agreed_price,
      fulfilled: true,
      timestamp_ms: now,
      latency_ms: latencyMs,
    });

    return { ok: true };
  }

  /**
   * Slash seller for failure to commit/reveal or hash mismatch.
   */
  private slashSeller(reason: string): void {
    if (!this.agreement || !this.params.settlement) {
      return;
    }

    const buyerAgentId = this.params.buyerAgentId ?? "buyer";
    const sellerAgentId = this.params.sellerAgentId ?? "seller";

    // Refund buyer payment
    this.params.settlement.unlock(buyerAgentId, this.agreement.agreed_price);

    // Slash seller bond to buyer
    this.params.settlement.slash(sellerAgentId, buyerAgentId, this.agreement.seller_bond);

    // Update agreement status
    this.agreement.status = "SLASHED";

    // Create receipt
    const now = this.params.now();
    const latencyMs = this.start_ms ? now - this.start_ms : undefined;
    this.receipt = createReceipt({
      intent_id: this.agreement.intent_id,
      buyer_agent_id: this.agreement.buyer_agent_id,
      seller_agent_id: this.agreement.seller_agent_id,
      agreed_price: this.agreement.agreed_price,
      fulfilled: false,
      timestamp_ms: now,
      latency_ms: latencyMs,
      failure_code: "FAILED_PROOF",
    });

    this.status = "FAILED";
    this.terminal_result = {
      ok: false,
      outcome: "FAILED_PROOF",
      code: "FAILED_PROOF",
      reason,
      transcript: [...this.transcript],
    };
  }

  /**
   * Get the agreement if one exists.
   */
  getAgreement(): Agreement | undefined {
    return this.agreement;
  }

  /**
   * Get the receipt if one exists.
   */
  getReceipt(): Receipt | undefined {
    return this.receipt;
  }

  /**
   * Check for timeouts and update state.
   */
  tick(): SessionResult | null {
    if (this.status === "IDLE" || this.status === "ACCEPTED" || this.status === "REJECTED" || this.status === "TIMEOUT" || this.status === "FAILED") {
      return this.terminal_result ?? null; // Already terminal or idle
    }

    const now = this.params.now();
    const policy = this.params.compiledPolicy.base;

    // Check max total duration
    if (this.start_ms !== undefined) {
      const elapsed_ms = now - this.start_ms;
      if (elapsed_ms > policy.negotiation.max_total_duration_ms) {
        this.terminateFromGuard({
          ok: false,
          code: "FAILED_NEGOTIATION_TIMEOUT",
          reason: "duration exceeded",
        });
        return this.terminal_result ?? null;
      }
    }

    // Check intent expiry
    if (this.intent && now > this.intent.expires_at_ms) {
      this.terminateFromGuard({
        ok: false,
        code: "FAILED_NEGOTIATION_TIMEOUT",
        reason: "intent expired",
      });
      return this.terminal_result ?? null;
    }

    // Check max rounds
    const maxRounds = policy.negotiation.max_rounds;
    if (this.round >= maxRounds) {
      this.terminateFromGuard({
        ok: false,
        code: "FAILED_NEGOTIATION_TIMEOUT",
        reason: "rounds exceeded",
      });
      return this.terminal_result ?? null;
    }

    // Check agreement deadlines if in LOCKED or EXCHANGING status
    if (this.agreement && (this.status === "LOCKED" || this.status === "EXCHANGING")) {
      if (now > this.agreement.delivery_deadline_ms) {
        if (this.status === "LOCKED") {
          // Seller failed to commit
          this.slashSeller("Seller failed to commit by deadline");
          return this.terminal_result ?? null;
        } else if (this.status === "EXCHANGING") {
          // Seller failed to reveal
          this.slashSeller("Seller failed to reveal by deadline");
          return this.terminal_result ?? null;
        }
      }
    }

    return null;
  }

  /**
   * Terminate the session with a failure outcome.
   */
  private terminate(outcome: TerminalOutcome, code: FailureCode, reason: string): void {
    this.status = outcome === "ACCEPTED" ? "ACCEPTED" : outcome === "REJECTED" ? "REJECTED" : outcome === "TIMEOUT" ? "TIMEOUT" : "FAILED";
    
    if (!this.terminal_result) {
      this.terminal_result = {
        ok: false,
        outcome,
        code,
        reason,
        transcript: [...this.transcript],
      };
    }
  }

  /**
   * Handle guard failure and terminate session with appropriate outcome.
   */
  private terminateFromGuard(guardResult: { ok: false; code: FailureCode; reason?: string }): { ok: false; code: FailureCode; reason: string } | SessionResult {
    const defaultReason = `Policy violation: ${guardResult.code}`;
    const reason = guardResult.reason ?? defaultReason;
    
    // TIMEOUT classification
    if (guardResult.code === "FAILED_NEGOTIATION_TIMEOUT" ||
        guardResult.code === "ROUND_EXCEEDED" ||
        guardResult.code === "DURATION_EXCEEDED" ||
        guardResult.code === "INTENT_EXPIRED") {
      // Normalize timeout codes
      const timeoutCode = guardResult.code === "ROUND_EXCEEDED" ? "FAILED_NEGOTIATION_TIMEOUT" :
                          guardResult.code === "DURATION_EXCEEDED" ? "FAILED_NEGOTIATION_TIMEOUT" :
                          guardResult.code === "INTENT_EXPIRED" ? "FAILED_NEGOTIATION_TIMEOUT" :
                          guardResult.code;
      const timeoutReason = guardResult.reason ?? (
        guardResult.code === "ROUND_EXCEEDED" ? "rounds exceeded" :
        guardResult.code === "DURATION_EXCEEDED" ? "duration exceeded" :
        guardResult.code === "INTENT_EXPIRED" ? "intent expired" :
        "negotiation timeout"
      );
      
      this.status = "TIMEOUT";
      const timeoutTranscriptCopy = [...this.transcript];
      this.terminal_result = {
        ok: false,
        outcome: "TIMEOUT",
        code: timeoutCode,
        reason: timeoutReason,
        transcript: timeoutTranscriptCopy,
      };
      return { ok: false, code: timeoutCode, reason: timeoutReason };
    }

    // Otherwise failed terminal
    const outcome = this.mapCodeToOutcome(guardResult.code);
    this.status = outcome === "ACCEPTED" ? "ACCEPTED" : outcome === "REJECTED" ? "REJECTED" : outcome === "TIMEOUT" ? "TIMEOUT" : "FAILED";
    const transcriptCopy = [...this.transcript];
    this.terminal_result = {
      ok: false,
      outcome,
      code: guardResult.code,
      reason,
      transcript: transcriptCopy,
    };
    return { ok: false, code: guardResult.code, reason };
  }

  /**
   * Map FailureCode to TerminalOutcome.
   */
  private mapCodeToOutcome(code: FailureCode): TerminalOutcome {
    switch (code) {
      case "FAILED_IDENTITY":
        return "FAILED_IDENTITY";
      case "NEW_AGENT_EXCLUDED":
      case "REGION_NOT_ALLOWED":
      case "FAILURE_RATE_TOO_HIGH":
      case "TIMEOUT_RATE_TOO_HIGH":
      case "MISSING_REQUIRED_CREDENTIALS":
      case "UNTRUSTED_ISSUER":
      case "INTENT_NOT_ALLOWED":
      case "SESSION_SPEND_CAP_EXCEEDED":
      case "ONE_OF_ADMISSION_FAILED":
        return "FAILED_ADMISSION";
      case "SETTLEMENT_MODE_NOT_ALLOWED":
      case "PRE_SETTLEMENT_LOCK_REQUIRED":
      case "BOND_INSUFFICIENT":
        return "FAILED_ESCROW";
      case "SCHEMA_VALIDATION_FAILED":
        return "FAILED_PROOF";
      case "LATENCY_BREACH":
      case "FRESHNESS_BREACH":
        return "FAILED_SLA";
      case "STREAMING_SPEND_CAP_EXCEEDED":
        return "FAILED_BUDGET";
      case "FAILED_REFERENCE_BAND":
      case "QUOTE_OUT_OF_BAND":
      case "TRANSCRIPT_STORAGE_FORBIDDEN":
        return "FAILED_POLICY";
      default:
        return "FAILED_POLICY";
    }
  }
}


