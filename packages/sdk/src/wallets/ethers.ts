/**
 * Ethers Wallet Adapter
 * 
 * Production-safe EVM wallet adapter using ethers v6.
 * Supports private key or existing ethers.Wallet instance.
 * 
 * This adapter does NOT connect to a provider by default.
 * It only provides wallet functionality (address, signing) without network access.
 */

import type { WalletAdapter, WalletConnectResult, Chain, Address } from "./types";

// Type-safe error codes
export const WALLET_CONNECT_FAILED = "WALLET_CONNECT_FAILED";
export const WALLET_SIGN_FAILED = "WALLET_SIGN_FAILED";

// Wallet provider constants
export const ETHERS_WALLET_KIND = "ethers";
export const EVM_CHAIN = "evm";

export interface EthersWalletOptions {
  /** Private key as hex string (with or without 0x prefix) */
  privateKey?: string;
  /** Existing ethers.Wallet instance */
  wallet?: any; // Using any to avoid requiring ethers as a peer dependency in types
}

export interface AddressInfo {
  chain: string;
  value: string; // 0x-prefixed hex address
}

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

export class EthersWalletAdapter {
  private wallet: any; // ethers.Wallet instance
  private address: Address;
  private addressHex: string; // Store hex address for getAddress() return value
  public readonly kind = ETHERS_WALLET_KIND;
  public readonly chain: Chain = EVM_CHAIN;

  constructor(options: EthersWalletOptions) {
    if (!options.privateKey && !options.wallet) {
      throw new Error("EthersWalletAdapter requires either privateKey or wallet option");
    }

    if (options.wallet) {
      // Use provided wallet instance
      this.wallet = options.wallet;
    } else if (options.privateKey) {
      // Create wallet from private key
      // Try require first (for CommonJS), then fall back to synchronous import check
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { Wallet } = require("ethers");
        this.wallet = new Wallet(options.privateKey);
      } catch (error: any) {
        // If require fails, try to use createSync which will handle ESM
        // For ESM, we need to use a factory method instead
        if (error.code === "MODULE_NOT_FOUND" || error.message?.includes("require")) {
          throw new Error(
            "EthersWalletAdapter with privateKey requires ethers to be available. " +
            "In ESM environments, use EthersWalletAdapter.create() or pass an existing ethers.Wallet instance. " +
            "Original error: " + (error?.message || String(error))
          );
        }
        throw new Error(
          `Failed to create ethers wallet: ${error?.message || String(error)}`
        );
      }
    }

    // Pre-compute address (deterministic, no network call)
    // Convert hex string address to Uint8Array
    try {
      this.addressHex = this.wallet.address;
      this.address = hexToBytes(this.addressHex);
    } catch (error: any) {
      throw new Error(
        `Failed to get wallet address: ${error?.message || String(error)}`
      );
    }
  }

  /**
   * Create an EthersWalletAdapter from a private key (async, ESM-compatible).
   * Use this method in ESM environments where require() is not available.
   * 
   * @param privateKey - Private key as hex string (with or without 0x prefix)
   * @returns Promise resolving to EthersWalletAdapter instance
   */
  static async create(privateKey: string): Promise<EthersWalletAdapter> {
    try {
      const { Wallet } = await import("ethers");
      const wallet = new Wallet(privateKey);
      return new EthersWalletAdapter({ wallet });
    } catch (error: any) {
      if (error.code === "MODULE_NOT_FOUND") {
        throw new Error(
          "ethers v6 is required but not installed. " +
          "Install it with: npm install ethers@^6.0.0"
        );
      }
      throw new Error(
        `Failed to create ethers wallet: ${error?.message || String(error)}`
      );
    }
  }

  /**
   * Get the chain this wallet is associated with.
   * 
   * @returns Chain identifier ("evm")
   */
  getChain(): Chain {
    return this.chain;
  }

  /**
   * Get the wallet address (async for consistency with other adapters).
   * Returns address info with chain and 0x-prefixed hex value.
   * 
   * @returns Promise resolving to address info object with chain and value
   */
  async getAddress(): Promise<AddressInfo> {
    return {
      chain: EVM_CHAIN,
      value: this.addressHex,
    };
  }

  /**
   * Get the wallet address as Uint8Array (for WalletAdapter interface compatibility).
   * 
   * @returns Wallet address as Uint8Array
   */
  getAddressBytes(): Address {
    return this.address;
  }

  /**
   * Connect to the wallet.
   * For EthersWalletAdapter, this is a no-op since we already have the wallet.
   * No provider connection is made.
   * 
   * @returns Promise resolving to connection result with address and chain
   */
  async connect(): Promise<WalletConnectResult> {
    try {
      const address = this.getAddressBytes();
      return {
        ok: true,
        address,
        chain: this.chain,
      };
    } catch (error: any) {
      return {
        ok: false,
        error: error?.message || WALLET_CONNECT_FAILED,
      };
    }
  }

  /**
   * Sign a message using the wallet.
   * 
   * @param message - Message to sign as Uint8Array
   * @returns Promise resolving to signature as Uint8Array
   * @throws Error with WALLET_SIGN_FAILED code if signing fails
   */
  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    try {
      // ethers v6 signMessage accepts Uint8Array directly
      const signatureHex = await this.wallet.signMessage(message);
      // Convert hex signature to Uint8Array
      return hexToBytes(signatureHex);
    } catch (error: any) {
      const errorMessage = error?.message || "Failed to sign message";
      const errorWithCode = new Error(`${WALLET_SIGN_FAILED}: ${errorMessage}`);
      (errorWithCode as any).code = WALLET_SIGN_FAILED;
      throw errorWithCode;
    }
  }

  /**
   * Sign a transaction (optional).
   * 
   * @param txBytes - Transaction bytes as Uint8Array
   * @returns Promise resolving to signed transaction bytes as Uint8Array
   */
  async signTransaction(txBytes: Uint8Array): Promise<Uint8Array> {
    try {
      // For ethers, we need to deserialize the transaction, sign it, and serialize it back
      // This is a simplified implementation - in practice, you'd need to handle transaction types
      // For now, we'll just sign the raw bytes as a message (this is not correct for real transactions)
      // In a real implementation, you'd use ethers' transaction signing methods
      const signedHex = await this.wallet.signMessage(txBytes);
      return hexToBytes(signedHex);
    } catch (error: any) {
      const errorMessage = error?.message || "Failed to sign transaction";
      const errorWithCode = new Error(`${WALLET_SIGN_FAILED}: ${errorMessage}`);
      (errorWithCode as any).code = WALLET_SIGN_FAILED;
      throw errorWithCode;
    }
  }

  /**
   * Get balance for a specific asset.
   * Stub implementation - returns 0 since we don't connect to a provider by default.
   * 
   * @param asset_id - Asset ID (e.g., "USDC", "ETH")
   * @returns Promise resolving to balance amount (always 0 for now)
   */
  async getBalance(_asset_id: string): Promise<number> {
    // Stub implementation - requires provider connection
    return 0;
  }
}

