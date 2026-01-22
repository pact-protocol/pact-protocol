import type { SignedEnvelope, AcceptMessage } from "../protocol/index";
import type { FailureCode } from "../policy/types";

export type SessionStatus =
  | "IDLE"
  | "INTENT_OPEN"
  | "NEGOTIATING"
  | "ACCEPTED"
  | "LOCKED"
  | "EXCHANGING"
  | "REJECTED"
  | "TIMEOUT"
  | "FAILED";

export type TerminalOutcome =
  | "ACCEPTED"
  | "REJECTED"
  | "TIMEOUT"
  | "FAILED_IDENTITY"
  | "FAILED_ADMISSION"
  | "FAILED_ESCROW"
  | "FAILED_PROOF"
  | "FAILED_SLA"
  | "FAILED_POLICY"
  | "FAILED_BUDGET";

export interface SessionResultSuccess {
  ok: true;
  outcome: "ACCEPTED";
  accept: AcceptMessage;
  transcript: SignedEnvelope<any>[];
}

export interface SessionResultFailure {
  ok: false;
  outcome: TerminalOutcome;
  code: FailureCode;
  reason: string;
  transcript: SignedEnvelope<any>[];
}

export type SessionResult = SessionResultSuccess | SessionResultFailure;

/**
 * Map FailureCode to TerminalOutcome
 */
export function mapFailureCodeToOutcome(code: FailureCode): TerminalOutcome {
  if (code === "FAILED_NEGOTIATION_TIMEOUT") {
    return "TIMEOUT";
  }
  if (code === "MISSING_EXPIRES_AT" || code === "CLOCK_SKEW_TOO_LARGE") {
    return "FAILED_POLICY";
  }
  if (code === "INTENT_NOT_ALLOWED" || code === "SESSION_SPEND_CAP_EXCEEDED" || code === "ONE_OF_ADMISSION_FAILED") {
    return "FAILED_ADMISSION";
  }
  if (code === "ROUND_EXCEEDED" || code === "DURATION_EXCEEDED") {
    return "TIMEOUT";
  }
  if (code === "NEW_AGENT_EXCLUDED" || code === "REGION_NOT_ALLOWED" || code === "FAILURE_RATE_TOO_HIGH" || code === "TIMEOUT_RATE_TOO_HIGH" || code === "MISSING_REQUIRED_CREDENTIALS" || code === "UNTRUSTED_ISSUER") {
    return "FAILED_POLICY";
  }
  if (code === "QUOTE_OUT_OF_BAND" || code === "FAILED_REFERENCE_BAND") {
    return "FAILED_POLICY";
  }
  if (code === "SETTLEMENT_MODE_NOT_ALLOWED" || code === "PRE_SETTLEMENT_LOCK_REQUIRED" || code === "BOND_INSUFFICIENT") {
    return "FAILED_ESCROW";
  }
  if (code === "SCHEMA_VALIDATION_FAILED") {
    return "FAILED_PROOF";
  }
  if (code === "LATENCY_BREACH" || code === "FRESHNESS_BREACH") {
    return "FAILED_SLA";
  }
  if (code === "STREAMING_SPEND_CAP_EXCEEDED") {
    return "FAILED_BUDGET";
  }
  return "FAILED_POLICY";
}

