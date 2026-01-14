/**
 * Test Wallet Adapter
 * 
 * Simple wallet adapter for testing that always succeeds.
 */

import type { WalletAdapter } from "../types";

export class TestWalletAdapter implements WalletAdapter {
  private address: string;
  private chainId: string;

  constructor(address: string = "0x1234567890123456789012345678901234567890", chainId: string = "ethereum") {
    this.address = address;
    this.chainId = chainId;
  }

  async connect(): Promise<import("../types").WalletConnectResult> {
    return {
      ok: true,
      address: this.address,
      chain_id: this.chainId,
    };
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    return "0x" + "00".repeat(65); // Mock signature
  }

  async getBalance(asset_id: string): Promise<number> {
    return 1000; // Mock balance
  }
}

