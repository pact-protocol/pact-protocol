/**
 * Stripe Live Settlement Provider (v2 Phase 3 - Boundary Only)
 * 
 * Boundary/skeleton implementation for Stripe Live integration.
 * This is a placeholder that validates configuration and returns "not implemented" errors.
 * 
 * Purpose:
 * - Define the configuration interface for Stripe Live integration
 * - Validate environment variables and parameters
 * - Provide a clear boundary for external integration
 * 
 * Behavior:
 * - All operational methods return deterministic "not implemented" failures
 * - No network calls, no Stripe SDK usage
 * - Configuration validation only
 * 
 * Integration:
 * - This skeleton must be replaced with actual Stripe API integration in your service
 * - No network calls in OSS repo; integrate in your own service
 */

import type { SettlementProvider } from "./provider";
import type { SettlementIntent, SettlementHandle, SettlementResult } from "./types";

/**
 * Stripe Live Configuration
 * 
 * Combines environment variables and explicit parameters.
 * API key is read from environment (PACT_STRIPE_API_KEY) and never logged.
 */
export interface StripeLiveConfig {
  /** Mode: "sandbox" (default) or "live" */
  mode: "sandbox" | "live";
  
  /** API key from environment (PACT_STRIPE_API_KEY) - never logged */
  api_key?: string;
  
  /** Optional Stripe account ID */
  account_id?: string;
  
  /** Optional idempotency key prefix */
  idempotency_prefix?: string;
  
  /** Whether provider is enabled (default false; can be true only if env/api_key present) */
  enabled: boolean;
}

/**
 * Validate Stripe Live configuration.
 * 
 * @param input Raw configuration input (from params + env)
 * @returns Validation result with config or error
 */
export function validateStripeLiveConfig(input: unknown): 
  | { ok: true; config: StripeLiveConfig }
  | { ok: false; code: string; reason: string } {
  
  // Reject non-objects
  if (!input || typeof input !== "object") {
    return {
      ok: false,
      code: "INVALID_CONFIG",
      reason: "Stripe Live config must be an object",
    };
  }
  
  const obj = input as Record<string, unknown>;
  
  // Read API key from environment (never log it)
  const apiKey = process.env.PACT_STRIPE_API_KEY;
  
  // Parse mode (default: "sandbox")
  let mode: "sandbox" | "live" = "sandbox";
  if (obj.mode !== undefined) {
    if (typeof obj.mode !== "string") {
      return {
        ok: false,
        code: "INVALID_MODE",
        reason: "Stripe Live mode must be a string",
      };
    }
    if (obj.mode !== "sandbox" && obj.mode !== "live") {
      return {
        ok: false,
        code: "INVALID_MODE",
        reason: `Stripe Live mode must be "sandbox" or "live", got: ${obj.mode}`,
      };
    }
    mode = obj.mode;
  }
  
  // Also check env var for mode
  const envMode = process.env.PACT_STRIPE_MODE;
  if (envMode === "sandbox" || envMode === "live") {
    mode = envMode;
  }
  
  // Parse account_id (optional)
  let accountId: string | undefined;
  if (obj.account_id !== undefined) {
    if (typeof obj.account_id !== "string") {
      return {
        ok: false,
        code: "INVALID_ACCOUNT_ID",
        reason: "Stripe Live account_id must be a string",
      };
    }
    accountId = obj.account_id;
  }
  
  // Parse idempotency_prefix (optional)
  let idempotencyPrefix: string | undefined;
  if (obj.idempotency_prefix !== undefined) {
    if (typeof obj.idempotency_prefix !== "string") {
      return {
        ok: false,
        code: "INVALID_IDEMPOTENCY_PREFIX",
        reason: "Stripe Live idempotency_prefix must be a string",
      };
    }
    idempotencyPrefix = obj.idempotency_prefix;
  }
  
  // Parse enabled (default: false)
  let enabled = false;
  if (obj.enabled !== undefined) {
    if (typeof obj.enabled !== "boolean") {
      return {
        ok: false,
        code: "INVALID_ENABLED",
        reason: "Stripe Live enabled must be a boolean",
      };
    }
    enabled = obj.enabled;
  }
  
  // Also check env var for enabled
  if (process.env.PACT_STRIPE_ENABLED === "true" || process.env.PACT_STRIPE_ENABLED === "1") {
    enabled = true;
  }
  
  // Validate: enabled=true requires api_key
  if (enabled && !apiKey) {
    return {
      ok: false,
      code: "MISSING_API_KEY",
      reason: "Stripe Live enabled=true requires PACT_STRIPE_API_KEY environment variable",
    };
  }
  
  // Reject unknown properties (defensive validation)
  const allowedKeys = ["mode", "account_id", "idempotency_prefix", "enabled"];
  const unknownKeys = Object.keys(obj).filter(key => !allowedKeys.includes(key));
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      code: "UNKNOWN_PROPERTIES",
      reason: `Stripe Live config contains unknown properties: ${unknownKeys.join(", ")}`,
    };
  }
  
  return {
    ok: true,
    config: {
      mode,
      api_key: apiKey, // Include in config but never log
      account_id: accountId,
      idempotency_prefix: idempotencyPrefix,
      enabled,
    },
  };
}

/**
 * Redact API key from error messages.
 * Prevents secrets from appearing in logs/transcripts.
 */
function redactApiKey(message: string): string {
  // Replace any potential API key patterns (sk_live_*, sk_test_*)
  return message.replace(/sk_(live|test)_[a-zA-Z0-9]+/g, "sk_***REDACTED***");
}

/**
 * Stripe Live Settlement Provider (Boundary Only)
 * 
 * Skeleton implementation that returns "not implemented" errors.
 * All operational methods return deterministic failures.
 */
export class StripeLiveSettlementProvider implements SettlementProvider {
  private config: StripeLiveConfig;
  
  constructor(config: StripeLiveConfig) {
    this.config = config;
  }
  
  // ============================================================================
  // Core Settlement Provider Interface (All return "not implemented")
  // ============================================================================
  
  getBalance(_agentId: string, _chain?: string, _asset?: string): number {
    // Boundary only - return 0
    return 0;
  }
  
  getLocked(_agentId: string, _chain?: string, _asset?: string): number {
    // Boundary only - return 0
    return 0;
  }
  
  lock(_agentId: string, _amount: number, _chain?: string, _asset?: string): void {
    throw new Error(
      redactApiKey("stripe_live is a boundary only; enable via env and integrate externally")
    );
  }
  
  release(_agentId: string, _amount: number, _chain?: string, _asset?: string): void {
    throw new Error(
      redactApiKey("stripe_live is a boundary only; enable via env and integrate externally")
    );
  }
  
  pay(_from: string, _to: string, _amount: number, _chain?: string, _asset?: string, _meta?: Record<string, unknown>): void {
    throw new Error(
      redactApiKey("stripe_live is a boundary only; enable via env and integrate externally")
    );
  }
  
  slashBond(_providerId: string, _amount: number, _beneficiaryId: string, _chain?: string, _asset?: string, _meta?: Record<string, unknown>): void {
    throw new Error(
      redactApiKey("stripe_live is a boundary only; enable via env and integrate externally")
    );
  }
  
  credit(_agentId: string, _amount: number, _chain?: string, _asset?: string): void {
    throw new Error(
      redactApiKey("stripe_live is a boundary only; enable via env and integrate externally")
    );
  }
  
  debit(_agentId: string, _amount: number, _chain?: string, _asset?: string): void {
    throw new Error(
      redactApiKey("stripe_live is a boundary only; enable via env and integrate externally")
    );
  }
  
  lockFunds(_agentId: string, _amount: number): boolean {
    throw new Error(
      redactApiKey("stripe_live is a boundary only; enable via env and integrate externally")
    );
  }
  
  lockBond(_agentId: string, _amount: number): boolean {
    throw new Error(
      redactApiKey("stripe_live is a boundary only; enable via env and integrate externally")
    );
  }
  
  unlock(_agentId: string, _amount: number): void {
    throw new Error(
      redactApiKey("stripe_live is a boundary only; enable via env and integrate externally")
    );
  }
  
  releaseFunds(_toAgentId: string, _amount: number): void {
    throw new Error(
      redactApiKey("stripe_live is a boundary only; enable via env and integrate externally")
    );
  }
  
  slash(_fromAgentId: string, _toAgentId: string, _amount: number): void {
    throw new Error(
      redactApiKey("stripe_live is a boundary only; enable via env and integrate externally")
    );
  }
  
  streamTick(_buyerId: string, _sellerId: string, _amount: number): boolean {
    throw new Error(
      redactApiKey("stripe_live is a boundary only; enable via env and integrate externally")
    );
  }
  
  // ============================================================================
  // Settlement Lifecycle API (All return "not implemented" failures)
  // ============================================================================
  
  async prepare(_intent: SettlementIntent): Promise<SettlementHandle> {
    throw new Error(
      redactApiKey("stripe_live is a boundary only; enable via env and integrate externally")
    );
  }
  
  async commit(_handle_id: string): Promise<SettlementResult> {
    return {
      ok: false,
      status: "failed",
      paid_amount: 0,
      handle_id: _handle_id,
      failure_code: "SETTLEMENT_PROVIDER_NOT_IMPLEMENTED",
      failure_reason: redactApiKey("stripe_live is a boundary only; enable via env and integrate externally"),
    };
  }
  
  async abort(_handle_id: string, _reason?: string): Promise<void> {
    throw new Error(
      redactApiKey("stripe_live is a boundary only; enable via env and integrate externally")
    );
  }
  
  async poll(_handle_id: string): Promise<SettlementResult> {
    return {
      ok: false,
      status: "failed",
      paid_amount: 0,
      handle_id: _handle_id,
      failure_code: "SETTLEMENT_PROVIDER_NOT_IMPLEMENTED",
      failure_reason: redactApiKey("stripe_live is a boundary only; enable via env and integrate externally"),
    };
  }
  
  async refund(_refund: {
    dispute_id: string;
    from: string;
    to: string;
    amount: number;
    reason?: string;
    idempotency_key?: string;
  }): Promise<{ ok: boolean; refunded_amount: number; code?: string; reason?: string }> {
    return {
      ok: false,
      refunded_amount: 0,
      code: "SETTLEMENT_PROVIDER_NOT_IMPLEMENTED",
      reason: redactApiKey("stripe_live is a boundary only; enable via env and integrate externally"),
    };
  }
}
