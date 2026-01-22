/**
 * ZK-KYA Tests (v2 Phase 5)
 * 
 * Tests for ZK-KYA proof hashing and canonicalization.
 */

import { describe, it, expect } from "vitest";
import { canonicalizePublicInputs, sha256Hex, convertZkKyaInputToProof } from "../index";

describe("canonicalizePublicInputs", () => {
  it("should produce deterministic output for same inputs", () => {
    const inputs = { a: 1, b: 2, c: "test" };
    const result1 = canonicalizePublicInputs(inputs);
    const result2 = canonicalizePublicInputs(inputs);
    
    expect(result1).toBe(result2);
  });
  
  it("should sort object keys", () => {
    const inputs1 = { z: 1, a: 2, m: 3 };
    const inputs2 = { a: 2, m: 3, z: 1 };
    
    const result1 = canonicalizePublicInputs(inputs1);
    const result2 = canonicalizePublicInputs(inputs2);
    
    expect(result1).toBe(result2);
  });
  
  it("should handle nested objects", () => {
    const inputs = {
      outer: {
        inner: {
          value: 42,
        },
      },
    };
    
    const result = canonicalizePublicInputs(inputs);
    expect(result).toContain('"outer"');
    expect(result).toContain('"inner"');
    expect(result).toContain('"value"');
  });
  
  it("should preserve array order", () => {
    const inputs1 = { items: [1, 2, 3] };
    const inputs2 = { items: [3, 2, 1] };
    
    const result1 = canonicalizePublicInputs(inputs1);
    const result2 = canonicalizePublicInputs(inputs2);
    
    expect(result1).not.toBe(result2);
  });
  
  it("should handle empty objects", () => {
    const result = canonicalizePublicInputs({});
    expect(result).toBe("{}");
  });
  
  it("should handle null and undefined values", () => {
    const inputs = { a: null, b: undefined, c: "value" };
    const result = canonicalizePublicInputs(inputs);
    expect(result).toContain("null");
    expect(result).toContain("value");
  });
});

describe("sha256Hex", () => {
  it("should produce deterministic hashes", () => {
    const input = "test string";
    const hash1 = sha256Hex(input);
    const hash2 = sha256Hex(input);
    
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // SHA-256 hex is 64 chars
  });
  
  it("should produce different hashes for different inputs", () => {
    const hash1 = sha256Hex("input1");
    const hash2 = sha256Hex("input2");
    
    expect(hash1).not.toBe(hash2);
  });
  
  it("should handle Uint8Array input", () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const hash = sha256Hex(bytes);
    
    expect(hash.length).toBe(64);
    expect(typeof hash).toBe("string");
  });
  
  it("should handle empty string", () => {
    const hash = sha256Hex("");
    expect(hash.length).toBe(64);
  });
});

describe("convertZkKyaInputToProof", () => {
  it("should hash public inputs and proof bytes", () => {
    const input = {
      scheme: "groth16" as const,
      circuit_id: "kyc_v1",
      issuer_id: "issuer_123",
      public_inputs: { age: 25, verified: true },
      proof_bytes_b64: Buffer.from("proof bytes").toString("base64"),
      issued_at_ms: 1000,
      expires_at_ms: 2000,
    };
    
    const { proof, public_inputs_hash, proof_hash } = convertZkKyaInputToProof(input);
    
    expect(proof.scheme).toBe("groth16");
    expect(proof.circuit_id).toBe("kyc_v1");
    expect(proof.issuer_id).toBe("issuer_123");
    expect(proof.public_inputs_hash).toBe(public_inputs_hash);
    expect(proof.proof_hash).toBe(proof_hash);
    expect(proof.issued_at_ms).toBe(1000);
    expect(proof.expires_at_ms).toBe(2000);
    
    // Hashes should be 64-char hex strings
    expect(public_inputs_hash.length).toBe(64);
    expect(proof_hash.length).toBe(64);
  });
  
  it("should produce same hashes for same inputs", () => {
    const input = {
      scheme: "groth16" as const,
      circuit_id: "test",
      public_inputs: { a: 1, b: 2 },
      proof_bytes_b64: Buffer.from("same proof").toString("base64"),
    };
    
    const { proof: proof1 } = convertZkKyaInputToProof(input);
    const { proof: proof2 } = convertZkKyaInputToProof(input);
    
    expect(proof1.public_inputs_hash).toBe(proof2.public_inputs_hash);
    expect(proof1.proof_hash).toBe(proof2.proof_hash);
  });
  
  it("should handle missing public inputs", () => {
    const input = {
      scheme: "plonk" as const,
      circuit_id: "test",
      proof_bytes_b64: Buffer.from("proof").toString("base64"),
    };
    
    const { proof } = convertZkKyaInputToProof(input);
    
    // Should hash empty object
    expect(proof.public_inputs_hash.length).toBe(64);
  });
  
  it("should handle missing proof bytes", () => {
    const input = {
      scheme: "halo2" as const,
      circuit_id: "test",
      public_inputs: { value: 42 },
    };
    
    const { proof } = convertZkKyaInputToProof(input);
    
    // Should hash empty string
    expect(proof.proof_hash.length).toBe(64);
  });
  
  it("should preserve metadata", () => {
    const input = {
      scheme: "groth16" as const,
      circuit_id: "test",
      meta: { version: "1.0", source: "test" },
    };
    
    const { proof } = convertZkKyaInputToProof(input);
    
    expect(proof.meta).toEqual({ version: "1.0", source: "test" });
  });
});
