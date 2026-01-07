import type { FailureCode } from "../policy/types";

/**
 * Protocol violation error (wrong phase/order).
 * These are internal errors that should be converted to SessionResult failures.
 */
export class ProtocolViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtocolViolationError";
  }
}

/**
 * Policy violation error (wraps FailureCode).
 * These are internal errors that should be converted to SessionResult failures.
 */
export class PolicyViolationError extends Error {
  constructor(public readonly code: FailureCode, message: string) {
    super(message);
    this.name = "PolicyViolationError";
  }
}

/**
 * Timeout error (rounds/duration/expiry).
 * These are internal errors that should be converted to SessionResult failures.
 */
export class TimeoutError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "TimeoutError";
  }
}

