/**
 * Unit tests: platform_verified (Stripe) payload validation.
 */

import { describe, it, expect } from "vitest";
import { validatePlatformVerifiedPayload } from "../validatePlatformVerified.js";

/** Valid 64-char hex fingerprint (SHA-256 style). */
const VALID_FINGERPRINT = "sha256:" + "a".repeat(64);

describe("validatePlatformVerifiedPayload", () => {
  const validStripePayload = {
    platform: "stripe",
    account_type: "merchant",
    account_id_fingerprint: VALID_FINGERPRINT,
  };

  it("does not throw for non-platform_verified anchor_type", () => {
    expect(() =>
      validatePlatformVerifiedPayload("kyb_verified", { foo: "bar" })
    ).not.toThrow();
  });

  it("accepts valid platform_verified stripe payload", () => {
    expect(() =>
      validatePlatformVerifiedPayload("platform_verified", validStripePayload)
    ).not.toThrow();
  });

  it("accepts account_type customer", () => {
    expect(() =>
      validatePlatformVerifiedPayload("platform_verified", {
        ...validStripePayload,
        account_type: "customer",
      })
    ).not.toThrow();
  });

  it("throws when platform is not stripe", () => {
    expect(() =>
      validatePlatformVerifiedPayload("platform_verified", {
        ...validStripePayload,
        platform: "other",
      })
    ).toThrow(/payload.platform === "stripe"/);
  });

  it("throws when account_type is missing or invalid", () => {
    expect(() =>
      validatePlatformVerifiedPayload("platform_verified", {
        platform: "stripe",
        account_id_fingerprint: "sha256:abc",
      })
    ).toThrow(/account_type/);
    expect(() =>
      validatePlatformVerifiedPayload("platform_verified", {
        ...validStripePayload,
        account_type: "invalid",
      })
    ).toThrow(/account_type/);
  });

  it("throws when account_id_fingerprint is missing or wrong format", () => {
    expect(() =>
      validatePlatformVerifiedPayload("platform_verified", {
        platform: "stripe",
        account_type: "merchant",
      })
    ).toThrow(/account_id_fingerprint/);
    expect(() =>
      validatePlatformVerifiedPayload("platform_verified", {
        ...validStripePayload,
        account_id_fingerprint: "sha256:abc",
      })
    ).toThrow(/64 hex/);
    expect(() =>
      validatePlatformVerifiedPayload("platform_verified", {
        ...validStripePayload,
        account_id_fingerprint: "abc123",
      })
    ).toThrow(/64 hex|sha256/);
  });

  it("throws when payload contains raw Stripe id (acct_)", () => {
    expect(() =>
      validatePlatformVerifiedPayload("platform_verified", {
        ...validStripePayload,
        raw_id: "acct_12345",
      })
    ).toThrow(/must not contain raw Stripe IDs/);
  });

  it("throws when payload contains raw Stripe id (cus_)", () => {
    expect(() =>
      validatePlatformVerifiedPayload("platform_verified", {
        ...validStripePayload,
        customer_id: "cus_67890",
      })
    ).toThrow(/must not contain raw Stripe IDs/);
  });
});
