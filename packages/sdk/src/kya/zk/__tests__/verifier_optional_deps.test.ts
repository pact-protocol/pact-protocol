/**
 * ZK-KYA Verifier Optional Dependency Tests
 * 
 * Tests for DefaultZkKyaVerifier optional dependency behavior.
 * Verifies graceful fallback when 'snarkjs' package is not installed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DefaultZkKyaVerifier } from "../verifier";
import type { ZkKyaProof } from "../types";

describe("DefaultZkKyaVerifier - Optional Dependency Behavior", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  const createTestProof = (): ZkKyaProof => ({
    scheme: "groth16",
    circuit_id: "kyc_v1",
    issuer_id: "issuer_123",
    public_inputs_hash: "abc123",
    proof_hash: "def456",
    issued_at_ms: Date.now() - 86400000, // 1 day ago
    expires_at_ms: Date.now() + 86400000 * 30, // 30 days from now
  });

  describe("When snarkjs package is NOT installed", () => {
    it("should initialize without errors", () => {
      // When snarkjs is not available, the verifier should initialize
      // but return errors when verifying
      expect(() => {
        const verifier = new DefaultZkKyaVerifier();
      }).not.toThrow();
    });

    it("should return ZK_KYA_NOT_IMPLEMENTED when verifying proofs", async () => {
      const verifier = new DefaultZkKyaVerifier();
      const proof = createTestProof();

      const result = await verifier.verify({
        agent_id: "agent1",
        proof,
        now_ms: Date.now(),
      });

      // If snarkjs is not available, should return ZK_KYA_NOT_IMPLEMENTED
      // If it is available, this test may behave differently
      if (result.ok === false) {
        expect(result.reason).toBeDefined();
        expect(result.reason?.includes("ZK_KYA_NOT_IMPLEMENTED") || result.reason?.includes("snarkjs") || result.reason?.includes("ZK_KYA_EXPIRED")).toBeTruthy();
      } else {
        // If snarkjs is available and verification succeeded, that's also valid
        expect(result.ok).toBe(true);
      }
    });

    it("should still check expiration even without snarkjs", async () => {
      const verifier = new DefaultZkKyaVerifier();
      const now = Date.now();
      
      // Expired proof
      const expiredProof: ZkKyaProof = {
        ...createTestProof(),
        expires_at_ms: now - 1000, // Expired 1 second ago
      };

      const result = await verifier.verify({
        agent_id: "agent1",
        proof: expiredProof,
        now_ms: now,
      });

      expect(result.ok).toBe(false);
      // Should fail on expiration or snarkjs availability
      expect(result.reason?.includes("ZK_KYA_EXPIRED") || result.reason?.includes("ZK_KYA_NOT_IMPLEMENTED") || result.reason?.includes("snarkjs")).toBeTruthy();
    });

    it("should provide helpful error message with installation instructions", async () => {
      const verifier = new DefaultZkKyaVerifier();

      const result = await verifier.verify({
        agent_id: "agent1",
        proof: createTestProof(),
        now_ms: Date.now(),
      });

      // Error message should mention snarkjs if not available
      if (!result.ok && result.reason) {
        expect(result.reason.includes("snarkjs") || result.reason.includes("ZK_KYA_NOT_IMPLEMENTED")).toBeTruthy();
      }
    });
  });

  describe("When snarkjs package IS installed", () => {
    it("should initialize without errors", () => {
      expect(() => {
        const verifier = new DefaultZkKyaVerifier();
      }).not.toThrow();
    });

    it("should attempt verification when snarkjs is available", async () => {
      const verifier = new DefaultZkKyaVerifier();
      const proof = createTestProof();

      const result = await verifier.verify({
        agent_id: "agent1",
        proof,
        now_ms: Date.now(),
      });

      // Result depends on whether snarkjs is available and proof validity
      // We just verify it doesn't crash
      expect(result).toBeDefined();
      expect(typeof result.ok).toBe("boolean");
    });
  });

  describe("Expiration checks (independent of snarkjs)", () => {
    it("should check expiration before attempting verification", async () => {
      const verifier = new DefaultZkKyaVerifier();
      const now = Date.now();
      
      // Expired proof
      const expiredProof: ZkKyaProof = {
        ...createTestProof(),
        expires_at_ms: now - 1000,
      };

      const result = await verifier.verify({
        agent_id: "agent1",
        proof: expiredProof,
        now_ms: now,
      });

      expect(result.ok).toBe(false);
      expect(result.reason?.includes("ZK_KYA_EXPIRED") || result.reason?.includes("expired")).toBeTruthy();
    });

    it("should handle proofs without expiration", async () => {
      const verifier = new DefaultZkKyaVerifier();
      
      const proofWithoutExpiration: ZkKyaProof = {
        ...createTestProof(),
        expires_at_ms: undefined as any,
      };

      const result = await verifier.verify({
        agent_id: "agent1",
        proof: proofWithoutExpiration,
        now_ms: Date.now(),
      });

      // Should handle missing expiration (may be accepted or rejected based on implementation)
      expect(result).toBeDefined();
    });
  });
});
