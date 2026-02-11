/**
 * Unit tests: oidc_verified payload validation.
 */

import { describe, it, expect } from "vitest";
import { validateOidcPayload } from "../validateOidc.js";

const VALID_FINGERPRINT = "sha256:" + "a".repeat(64);

describe("validateOidcPayload", () => {
  const validPayload = {
    issuer: "https://issuer.example.com",
    subject: "user-or-service-subject",
    assertion_fingerprint: VALID_FINGERPRINT,
    audience: "pact-registry",
    tenant: "acme",
    email: "service@acme.com",
    scope: ["procurement", "settlement"],
  };

  it("does not throw for non-oidc_verified anchor_type", () => {
    expect(() =>
      validateOidcPayload("kyb_verified", { foo: "bar" })
    ).not.toThrow();
  });

  it("accepts valid oidc_verified payload", () => {
    expect(() =>
      validateOidcPayload("oidc_verified", validPayload)
    ).not.toThrow();
  });

  it("throws when issuer is missing", () => {
    expect(() =>
      validateOidcPayload("oidc_verified", {
        subject: "user",
        assertion_fingerprint: VALID_FINGERPRINT,
      })
    ).toThrow(/issuer/);
  });

  it("throws when subject is missing", () => {
    expect(() =>
      validateOidcPayload("oidc_verified", {
        issuer: "https://issuer.example.com",
        assertion_fingerprint: VALID_FINGERPRINT,
      })
    ).toThrow(/subject/);
  });

  it("throws when assertion_fingerprint is missing or wrong format", () => {
    expect(() =>
      validateOidcPayload("oidc_verified", {
        ...validPayload,
        assertion_fingerprint: "sha256:abc",
      })
    ).toThrow(/64 hex/);
    expect(() =>
      validateOidcPayload("oidc_verified", {
        issuer: validPayload.issuer,
        subject: validPayload.subject,
      })
    ).toThrow(/assertion_fingerprint/);
  });

  it("rejects raw JWT in payload", () => {
    expect(() =>
      validateOidcPayload("oidc_verified", {
        ...validPayload,
        id_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxx",
      })
    ).toThrow(/raw JWTs|SAML/);
  });
});
