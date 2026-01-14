/**
 * Test Wallet Adapter
 * 
 * Simple wallet adapter for testing that always succeeds.
 */

import type { WalletAdapter, Chain, Address, WalletConnectResult, WalletCapabilities } from "../types";
import type { AddressInfo } from "../ethers";

// Helper to convert hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  // Remove 0x prefix if present
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
  }
  return bytes;
}

// Helper to convert Uint8Array to hex string
function bytesToHex(bytes: Uint8Array): string {
  return "0x" + Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export class TestWalletAdapter implements WalletAdapter {
  private address: Address;
  public readonly kind = "test";
  public readonly chain: Chain;

  constructor(address: string = "0x1234567890123456789012345678901234567890", chain: Chain = "ethereum") {
    this.address = hexToBytes(address);
    this.chain = chain;
  }

  getChain(): Chain {
    return this.chain;
  }

  async getAddress(): Promise<AddressInfo> {
    // Convert Address (Uint8Array) to hex string
    const addressHex = bytesToHex(this.address);
    return {
      chain: this.chain,
      value: addressHex,
    };
  }

  async connect(): Promise<WalletConnectResult> {
    return {
      ok: true,
      address: this.address,
      chain: this.chain,
    };
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    // Mock signature: return 65 bytes of zeros
    return new Uint8Array(65);
  }

  async getBalance(asset_id: string): Promise<number> {
    return 1000; // Mock balance
  }

  /**
   * Get wallet capabilities (v2 Phase 2+).
   * TestWalletAdapter supports message signing but not transaction signing.
   * 
   * @returns Wallet capabilities
   */
  getCapabilities(): WalletCapabilities {
    // Determine chain from this.chain
    const chainType: "solana" | "evm" | "unknown" = 
      this.chain === "solana" ? "solana" :
      this.chain === "evm" || this.chain === "ethereum" || this.chain === "base" || this.chain === "polygon" || this.chain === "arbitrum" ? "evm" :
      "unknown";
    
    return {
      chain: chainType,
      can_sign_message: true, // Test adapter can sign messages
      can_sign_transaction: false, // Test adapter does not implement signTransaction
    };
  }
}

