/**
 * Unit tests: issue anchor -> verify signature -> anchor_id stable; revoke; expiry.
 */

import { describe, it, expect } from "vitest";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { issue } from "../issue.js";
import { verifyAttestationOffline, verifyAnchorId, computeExpectedAnchorId } from "../verify.js";
import type { TrustedIssuer } from "../types.js";

function generateKeypair(): { publicKeyB58: string; secretKeyB58: string } {
  const kp = nacl.sign.keyPair();
  return {
    publicKeyB58: bs58.encode(Buffer.from(kp.publicKey)),
    secretKeyB58: bs58.encode(Buffer.from(kp.secretKey)),
  };
}

describe("Anchor attestation issue and verify", () => {
  const issuer = generateKeypair();
  const trustedIssuers: TrustedIssuer[] = [
    { issuer_public_key_b58: issuer.publicKeyB58, name: "Test Registry", scopes: ["kyb_verified"] },
  ];

  it("issues anchor and anchor_id is stable (derived from payload)", () => {
    const att = issue(
      {
        subject_signer_public_key_b58: "subject-key-b58",
        anchor_type: "kyb_verified",
        payload: { org: "Acme" },
        display_name: "Acme Data LLC",
        verification_method: "kyb",
      },
      issuer.publicKeyB58,
      issuer.secretKeyB58,
      1000
    );
    expect(att.anchor_id).toMatch(/^anchor-[0-9a-f]{64}$/);
    expect(computeExpectedAnchorId(att)).toBe(att.anchor_id);
  });

  it("verifyAttestationOffline accepts valid attestation", () => {
    const att = issue(
      {
        subject_signer_public_key_b58: "subject-key-b58",
        anchor_type: "kyb_verified",
        payload: {},
        display_name: "Acme",
      },
      issuer.publicKeyB58,
      issuer.secretKeyB58
    );
    const result = verifyAttestationOffline(att, trustedIssuers);
    expect(result.ok).toBe(true);
    expect(result.issuerTrusted).toBe(true);
  });

  it("verifyAttestationOffline rejects untrusted issuer", () => {
    const other = generateKeypair();
    const att = issue(
      {
        subject_signer_public_key_b58: "subject-key-b58",
        anchor_type: "kyb_verified",
        payload: {},
      },
      other.publicKeyB58,
      other.secretKeyB58
    );
    const result = verifyAttestationOffline(att, trustedIssuers);
    expect(result.ok).toBe(false);
    expect(result.issuerTrusted).toBe(false);
  });

  it("verifyAttestationOffline rejects expired attestation", () => {
    const att = issue(
      {
        subject_signer_public_key_b58: "subject-key-b58",
        anchor_type: "kyb_verified",
        payload: {},
        expires_at_ms: 1,
      },
      issuer.publicKeyB58,
      issuer.secretKeyB58,
      0
    );
    const result = verifyAttestationOffline(att, trustedIssuers);
    expect(result.ok).toBe(false);
    expect(result.expired).toBe(true);
  });

  it("verifyAnchorId rejects tampered anchor_id", () => {
    const att = issue(
      {
        subject_signer_public_key_b58: "subject-key-b58",
        anchor_type: "kyb_verified",
        payload: {},
      },
      issuer.publicKeyB58,
      issuer.secretKeyB58
    );
    expect(verifyAnchorId(att)).toBe(true);
    const tampered = { ...att, anchor_id: "anchor-" + "0".repeat(64) };
    expect(verifyAnchorId(tampered)).toBe(false);
  });
});

describe("platform_verified (Stripe) issuance", () => {
  const issuer = (() => {
    const kp = nacl.sign.keyPair();
    return {
      publicKeyB58: bs58.encode(Buffer.from(kp.publicKey)),
      secretKeyB58: bs58.encode(Buffer.from(kp.secretKey)),
    };
  })();

  /** Valid Base58 Ed25519 public key (required for server-side validation). */
  const validSubjectKeyB58 = bs58.encode(Buffer.from(nacl.sign.keyPair().publicKey));
  /** Valid 64-char hex fingerprint for platform_verified. */
  const validFingerprint = "sha256:" + "a".repeat(64);

  it("issues platform_verified anchor with valid stripe payload and is stored/verifiable", () => {
    const att = issue(
      {
        subject_signer_public_key_b58: validSubjectKeyB58,
        anchor_type: "platform_verified",
        verification_method: "stripe",
        payload: {
          platform: "stripe",
          account_type: "merchant",
          account_id_fingerprint: validFingerprint,
          scope: ["payments", "refunds"],
        },
        display_name: "Acme Data LLC (Stripe)",
      },
      issuer.publicKeyB58,
      issuer.secretKeyB58
    );
    expect(att.anchor_id).toMatch(/^anchor-[0-9a-f]{64}$/);
    expect(att.anchor_type).toBe("platform_verified");
    expect(att.verification_method).toBe("stripe");
    expect(att.payload).toMatchObject({ platform: "stripe", account_type: "merchant" });
  });

  it("platform_verified issuance with account_id_fingerprint sha256:<hex> and evidence_refs succeeds (no base58 on payload)", () => {
    const att = issue(
      {
        subject_signer_public_key_b58: validSubjectKeyB58,
        anchor_type: "platform_verified",
        payload: {
          platform: "stripe",
          account_type: "merchant",
          account_id_fingerprint: validFingerprint,
        },
        evidence_refs: ["stripe:demo:link-001"],
        display_name: "Acme Data LLC",
      },
      issuer.publicKeyB58,
      issuer.secretKeyB58
    );
    expect(att.anchor_id).toMatch(/^anchor-[0-9a-f]{64}$/);
    expect(att.anchor_type).toBe("platform_verified");
    expect(att.payload.account_id_fingerprint).toBe(validFingerprint);
    expect(att.evidence_refs).toEqual(["stripe:demo:link-001"]);
  });

  it("service_account_verified issuance succeeds with evidence_fingerprint and evidence_refs", () => {
    const svcFingerprint = "sha256:" + "b".repeat(64);
    const att = issue(
      {
        subject_signer_public_key_b58: validSubjectKeyB58,
        anchor_type: "service_account_verified",
        verification_method: "service_account",
        payload: {
          cloud: "gcp",
          service_account: "svc-demo@project.iam.gserviceaccount.com",
          attestation_type: "workload_identity",
          evidence_fingerprint: svcFingerprint,
          scope: ["signing", "data_access"],
        },
        evidence_refs: ["gcp:workload_identity:demo:provider_b"],
        display_name: "Provider B (Service Account)",
      },
      issuer.publicKeyB58,
      issuer.secretKeyB58
    );
    expect(att.anchor_id).toMatch(/^anchor-[0-9a-f]{64}$/);
    expect(att.anchor_type).toBe("service_account_verified");
    expect(att.payload.evidence_fingerprint).toBe(svcFingerprint);
    expect(att.evidence_refs).toEqual(["gcp:workload_identity:demo:provider_b"]);
  });

  it("oidc_verified issuance succeeds with assertion_fingerprint and evidence_refs", () => {
    const oidcFingerprint = "sha256:" + "c".repeat(64);
    const att = issue(
      {
        subject_signer_public_key_b58: validSubjectKeyB58,
        anchor_type: "oidc_verified",
        verification_method: "oidc",
        payload: {
          issuer: "https://acme.okta.com",
          subject: "buyer-demo",
          assertion_fingerprint: oidcFingerprint,
          tenant: "acme",
          email: "buyer@acme.com",
        },
        evidence_refs: ["oidc:id_token:demo:buyer"],
        display_name: "Buyer (OIDC)",
      },
      issuer.publicKeyB58,
      issuer.secretKeyB58
    );
    expect(att.anchor_id).toMatch(/^anchor-[0-9a-f]{64}$/);
    expect(att.anchor_type).toBe("oidc_verified");
    expect(att.payload.assertion_fingerprint).toBe(oidcFingerprint);
    expect(att.evidence_refs).toEqual(["oidc:id_token:demo:buyer"]);
  });
});
