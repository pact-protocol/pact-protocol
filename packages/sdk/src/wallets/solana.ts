/**
 * Solana Wallet Adapter
 * 
 * Production-safe Solana wallet adapter using ed25519 (tweetnacl).
 * Supports Keypair or secretKey.
 * 
 * This adapter does NOT connect to a provider by default.
 * It only provides wallet functionality (address, signing) without network access.
 */

import type { WalletAdapter, WalletConnectResult, Chain, Address } from "./types";
import type { AddressInfo } from "./ethers";
import nacl from "tweetnacl";
import bs58 from "bs58";

// Type-safe error codes
export const WALLET_CONNECT_FAILED = "WALLET_CONNECT_FAILED";
export const WALLET_SIGN_FAILED = "WALLET_SIGN_FAILED";

// Wallet provider constants
export const SOLANA_WALLET_KIND = "solana-keypair";
export const SOLANA_CHAIN = "solana";

export interface SolanaWalletOptions {
  /** Solana Keypair with publicKey and secretKey */
  keypair?: {
    publicKey: Uint8Array;
    secretKey: Uint8Array;
  };
  /** Secret key as Uint8Array (64 bytes for ed25519) */
  secretKey?: Uint8Array;
}

export class SolanaWalletAdapter {
  private keypair: nacl.SignKeyPair;
  private publicKeyBase58: string;
  public readonly kind = SOLANA_WALLET_KIND;
  public readonly chain: Chain = SOLANA_CHAIN;

  constructor(options: SolanaWalletOptions) {
    if (!options.keypair && !options.secretKey) {
      throw new Error("SolanaWalletAdapter requires either keypair or secretKey option");
    }

    let keypair: nacl.SignKeyPair;

    if (options.keypair) {
      // Use provided keypair
      // tweetnacl expects secretKey to be 64 bytes (32 bytes private key + 32 bytes public key)
      // Solana keypairs have secretKey as 64 bytes
      keypair = {
        publicKey: options.keypair.publicKey,
        secretKey: options.keypair.secretKey,
      };
    } else if (options.secretKey) {
      // Create keypair from secretKey
      // tweetnacl.sign.keyPair.fromSecretKey expects 64 bytes (32 bytes private + 32 bytes public)
      // If only 32 bytes provided, we need to derive the keypair
      if (options.secretKey.length === 64) {
        // Full secret key (private + public)
        keypair = nacl.sign.keyPair.fromSecretKey(options.secretKey);
      } else if (options.secretKey.length === 32) {
        // Only private key, derive keypair
        keypair = nacl.sign.keyPair.fromSeed(options.secretKey);
      } else {
        throw new Error(
          `SolanaWalletAdapter secretKey must be 32 or 64 bytes, got ${options.secretKey.length}`
        );
      }
    } else {
      // This should never happen due to the check above, but TypeScript needs it
      throw new Error("SolanaWalletAdapter requires either keypair or secretKey option");
    }

    this.keypair = keypair;

    // Pre-compute base58 public key (deterministic, no network call)
    try {
      this.publicKeyBase58 = bs58.encode(this.keypair.publicKey);
    } catch (error: any) {
      throw new Error(
        `Failed to encode public key to base58: ${error?.message || String(error)}`
      );
    }
  }

  /**
   * Get the chain this wallet is associated with.
   * 
   * @returns Chain identifier ("solana")
   */
  getChain(): Chain {
    return this.chain;
  }

  /**
   * Get the wallet address (async for consistency with other adapters).
   * Returns address info with chain and base58-encoded public key.
   * 
   * @returns Promise resolving to address info object with chain and value
   */
  async getAddress(): Promise<AddressInfo> {
    return {
      chain: SOLANA_CHAIN,
      value: this.publicKeyBase58,
    };
  }

  /**
   * Connect to the wallet.
   * For SolanaWalletAdapter, this is a no-op since we already have the keypair.
   * No provider connection is made.
   * 
   * @returns Promise resolving to connection result with address and chain
   */
  async connect(): Promise<WalletConnectResult> {
    try {
      const addressInfo = await this.getAddress();
      // Convert base58 address to Uint8Array for WalletConnectResult
      const addressBytes = bs58.decode(addressInfo.value);
      return {
        ok: true,
        address: addressBytes,
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
   * Sign a message using ed25519 (tweetnacl.sign.detached).
   * 
   * @param message - Message to sign as Uint8Array
   * @returns Promise resolving to signature as Uint8Array (64 bytes for ed25519)
   * @throws Error with WALLET_SIGN_FAILED code if signing fails
   */
  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    try {
      // Use tweetnacl.sign.detached for ed25519 signing
      // Returns raw signature bytes (64 bytes)
      const signature = nacl.sign.detached(message, this.keypair.secretKey);
      return signature;
    } catch (error: any) {
      const errorMessage = error?.message || "Failed to sign message";
      const errorWithCode = new Error(`${WALLET_SIGN_FAILED}: ${errorMessage}`);
      (errorWithCode as any).code = WALLET_SIGN_FAILED;
      throw errorWithCode;
    }
  }

  /**
   * Sign a transaction.
   * Signs the transaction bytes and returns signature bytes only.
   * 
   * @param txBytes - Transaction bytes as Uint8Array
   * @returns Promise resolving to signature bytes as Uint8Array (64 bytes for ed25519)
   */
  async signTransaction(txBytes: Uint8Array): Promise<Uint8Array> {
    try {
      // Sign transaction bytes using ed25519
      // Returns raw signature bytes (64 bytes)
      const signature = nacl.sign.detached(txBytes, this.keypair.secretKey);
      return signature;
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
   * @param asset_id - Asset ID (e.g., "USDC", "SOL")
   * @returns Promise resolving to balance amount (always 0 for now)
   */
  async getBalance(_asset_id: string): Promise<number> {
    // Stub implementation - requires provider connection
    return 0;
  }
}

