/**
 * Unit tests: service_account_verified payload validation.
 */

import { describe, it, expect } from "vitest";
import { validateServiceAccountPayload } from "../validateServiceAccount.js";

const VALID_FINGERPRINT = "sha256:" + "a".repeat(64);

describe("validateServiceAccountPayload", () => {
  const validPayload = {
    cloud: "gcp",
    service_account: "svc-my-agent@project.iam.gserviceaccount.com",
    attestation_type: "workload_identity",
    evidence_fingerprint: VALID_FINGERPRINT,
    scope: ["signing", "payments"],
    region: "US",
  };

  it("does not throw for non-service_account_verified anchor_type", () => {
    expect(() =>
      validateServiceAccountPayload("kyb_verified", { foo: "bar" })
    ).not.toThrow();
  });

  it("accepts valid service_account_verified payload", () => {
    expect(() =>
      validateServiceAccountPayload("service_account_verified", validPayload)
    ).not.toThrow();
  });

  it("accepts cloud aws and azure", () => {
    expect(() =>
      validateServiceAccountPayload("service_account_verified", {
        ...validPayload,
        cloud: "aws",
        service_account: "arn:aws:iam::123456789012:role/my-role",
      })
    ).not.toThrow();
    expect(() =>
      validateServiceAccountPayload("service_account_verified", {
        ...validPayload,
        cloud: "azure",
        service_account: "my-app@tenant.azure.com",
      })
    ).not.toThrow();
  });

  it("throws when cloud is invalid", () => {
    expect(() =>
      validateServiceAccountPayload("service_account_verified", {
        ...validPayload,
        cloud: "other",
      })
    ).toThrow(/cloud/);
  });

  it("throws when service_account is missing", () => {
    expect(() =>
      validateServiceAccountPayload("service_account_verified", {
        cloud: "gcp",
        evidence_fingerprint: VALID_FINGERPRINT,
      })
    ).toThrow(/service_account/);
  });

  it("throws when evidence_fingerprint is missing or wrong format", () => {
    expect(() =>
      validateServiceAccountPayload("service_account_verified", {
        ...validPayload,
        evidence_fingerprint: "sha256:abc",
      })
    ).toThrow(/64 hex/);
    expect(() =>
      validateServiceAccountPayload("service_account_verified", {
        cloud: "gcp",
        service_account: validPayload.service_account,
      })
    ).toThrow(/evidence_fingerprint/);
  });

  it("rejects raw JWT in payload", () => {
    expect(() =>
      validateServiceAccountPayload("service_account_verified", {
        ...validPayload,
        raw_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxx",
      })
    ).toThrow(/raw JWTs|SAML|API keys/);
  });
});
