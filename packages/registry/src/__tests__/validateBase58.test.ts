/**
 * Base58 validation: only subject_signer_public_key_b58 is validated from the request body.
 * Payload and evidence_refs must not be base58-validated.
 */

import { describe, it, expect } from "vitest";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { validateBase58Field, validateIssueRequestBase58 } from "../validateBase58.js";

describe("validateIssueRequestBase58", () => {
  const validPubkeyB58 = bs58.encode(Buffer.from(nacl.sign.keyPair().publicKey));
  const validFingerprint = "sha256:" + "a".repeat(64);

  it("accepts body with valid subject_signer_public_key_b58 only", () => {
    expect(() =>
      validateIssueRequestBase58({
        subject_signer_public_key_b58: validPubkeyB58,
        anchor_type: "kyb_verified",
        payload: {},
      })
    ).not.toThrow();
  });

  it("accepts body with valid subject and payload.account_id_fingerprint sha256 (base58 not applied to payload)", () => {
    expect(() =>
      validateIssueRequestBase58({
        subject_signer_public_key_b58: validPubkeyB58,
        anchor_type: "platform_verified",
        payload: {
          platform: "stripe",
          account_type: "merchant",
          account_id_fingerprint: validFingerprint,
        },
        evidence_refs: ["stripe:demo:link-001"],
      })
    ).not.toThrow();
  });

  it("throws when subject_signer_public_key_b58 is non-base58", () => {
    expect(() =>
      validateIssueRequestBase58({
        subject_signer_public_key_b58: "not-base58!!!",
        anchor_type: "kyb_verified",
        payload: {},
      })
    ).toThrow(/non-base58|Invalid subject_signer/);
  });

  it("throws for empty or missing subject", () => {
    expect(() =>
      validateIssueRequestBase58({
        subject_signer_public_key_b58: "",
        anchor_type: "kyb_verified",
        payload: {},
      })
    ).toThrow();
    expect(() => validateBase58Field("   ", "subject_signer_public_key_b58")).toThrow();
  });
});

describe("validateBase58Field (server uses only this on subject key)", () => {
  const validPubkeyB58 = bs58.encode(Buffer.from(nacl.sign.keyPair().publicKey));

  it("accepts valid base58 subject key", () => {
    expect(() =>
      validateBase58Field(validPubkeyB58, "subject_signer_public_key_b58")
    ).not.toThrow();
  });

  it("throws for non-base58 value (e.g. sha256:... never passed here)", () => {
    expect(() =>
      validateBase58Field("sha256:abc", "subject_signer_public_key_b58")
    ).toThrow(/non-base58/);
  });
});
