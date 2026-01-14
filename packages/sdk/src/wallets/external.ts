/**
 * External Wallet Adapter
 * 
 * Placeholder adapter for external wallet providers.
 * Throws unless properly configured with a real wallet implementation.
 */

import type { WalletAdapter } from "./types";

export class ExternalWalletAdapter implements WalletAdapter {
  private params?: Record<string, unknown>;

  constructor(params?: Record<string, unknown>) {
    this.params = params;
  }

  async connect(): Promise<import("./types").WalletConnectResult> {
    // External wallet adapter requires configuration
    // In a real implementation, this would connect to MetaMask, Coinbase Wallet, etc.
    if (!this.params || !this.params.provider) {
      return {
        ok: false,
        error: "External wallet adapter not configured. Provide 'provider' in params.",
      };
    }

    // Placeholder: would connect to actual wallet provider
    throw new Error(
      `External wallet adapter not implemented. Provider: ${this.params.provider}`
    );
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    throw new Error(
      "External wallet adapter not implemented. Cannot sign message."
    );
  }

  async getBalance(asset_id: string): Promise<number> {
    // Stub implementation - returns 0
    return 0;
  }
}

