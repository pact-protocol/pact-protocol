import { describe, it, expect } from "vitest";
import { EthersWalletAdapter } from "../ethers";
import { SolanaWalletAdapter } from "../solana";
import { ExternalWalletAdapter } from "../external";
import { TestWalletAdapter } from "./test-adapter";
import type { WalletCapabilities } from "../types";

describe("Wallet Capabilities", () => {
  describe("EthersWalletAdapter", () => {
    it("should report correct capabilities (legacy)", async () => {
      const adapter = await EthersWalletAdapter.create("0x59c6995e998f97a5a0044976f094538c5f4f7e2f3c0d6b5e0c3e2d1b1a0f0001");
      const capabilities = adapter.getCapabilities();
      
      expect(capabilities).toEqual({
        chain: "evm",
        can_sign_message: true,
        can_sign_transaction: true,
      });
    });
    
    it("should report correct capabilities (v2 Phase 2 Execution Layer)", async () => {
      const adapter = await EthersWalletAdapter.create("0x59c6995e998f97a5a0044976f094538c5f4f7e2f3c0d6b5e0c3e2d1b1a0f0001");
      const capabilities = adapter.capabilities();
      
      expect(capabilities.can_sign).toBe(true);
      expect(capabilities.chains).toContain("evm");
      expect(capabilities.assets.length).toBeGreaterThan(0);
    });
  });

  describe("SolanaWalletAdapter", () => {
    it("should report correct capabilities (legacy)", () => {
      const fixedSeed = new Uint8Array([
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
        16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31
      ]);
      const adapter = new SolanaWalletAdapter({ secretKey: fixedSeed });
      const capabilities = adapter.getCapabilities();
      
      expect(capabilities).toEqual({
        chain: "solana",
        can_sign_message: true,
        can_sign_transaction: true,
      });
    });
    
    it("should report correct capabilities (v2 Phase 2 Execution Layer)", () => {
      const fixedSeed = new Uint8Array([
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
        16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31
      ]);
      const adapter = new SolanaWalletAdapter({ secretKey: fixedSeed });
      const capabilities = adapter.capabilities();
      
      expect(capabilities.can_sign).toBe(true);
      expect(capabilities.chains).toContain("solana");
      expect(capabilities.assets.length).toBeGreaterThan(0);
    });
  });

  describe("ExternalWalletAdapter", () => {
    it("should report no capabilities (legacy)", () => {
      const adapter = new ExternalWalletAdapter();
      const capabilities = adapter.getCapabilities();
      
      expect(capabilities).toEqual({
        chain: "unknown",
        can_sign_message: false,
        can_sign_transaction: false,
      });
    });
    
    it("should report no capabilities (v2 Phase 2 Execution Layer)", () => {
      const adapter = new ExternalWalletAdapter();
      const capabilities = adapter.capabilities();
      
      expect(capabilities.can_sign).toBe(false);
      expect(capabilities.chains).toEqual([]);
      expect(capabilities.assets).toEqual([]);
    });
  });

  describe("TestWalletAdapter", () => {
    it("should report message signing but not transaction signing for EVM chain", () => {
      const adapter = new TestWalletAdapter("0x1234567890123456789012345678901234567890", "ethereum");
      const capabilities = adapter.getCapabilities();
      
      expect(capabilities).toEqual({
        chain: "evm",
        can_sign_message: true,
        can_sign_transaction: false,
      });
    });

    it("should report message signing but not transaction signing for Solana chain", () => {
      const adapter = new TestWalletAdapter("0x1234567890123456789012345678901234567890", "solana");
      const capabilities = adapter.getCapabilities();
      
      expect(capabilities).toEqual({
        chain: "solana",
        can_sign_message: true,
        can_sign_transaction: false,
      });
    });

    it("should report unknown chain for unrecognized chain", () => {
      const adapter = new TestWalletAdapter("0x1234567890123456789012345678901234567890", "unknown-chain");
      const capabilities = adapter.getCapabilities();
      
      expect(capabilities).toEqual({
        chain: "unknown",
        can_sign_message: true,
        can_sign_transaction: false,
      });
    });
  });
});

