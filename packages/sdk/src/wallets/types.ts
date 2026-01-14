/**
 * Wallet Adapter Types
 * 
 * Chain-agnostic interface for wallet adapters to enable future integrations with
 * MetaMask, Coinbase Wallet, Solana wallets, etc. This is a seam for wallet connectivity.
 */

import type { AddressInfo } from "./ethers";

/**
 * Chain identifier (e.g., "ethereum", "solana", "base", "polygon")
 */
export type Chain = string;

/**
 * Wallet address as a byte array (chain-agnostic representation)
 */
export type Address = Uint8Array;

/**
 * Public wallet information
 */
export interface WalletPublicInfo {
  chain: Chain;
  address: Address;
}

/**
 * Wallet connection result
 */
export interface WalletConnectResult {
  ok: boolean;
  address?: Address;
  chain?: Chain;
  error?: string;
}

/**
 * Chain-agnostic wallet adapter interface
 */
export interface WalletAdapter {
  /**
   * Get the chain this wallet is associated with.
   * 
   * @returns Chain identifier
   */
  getChain(): Chain;

  /**
   * Get the wallet address (async, no network call).
   * 
   * @returns Promise resolving to address info with chain and value
   */
  getAddress(): Promise<AddressInfo>;

  /**
   * Connect to the wallet.
   * 
   * @returns Promise resolving to connection result with address and chain
   */
  connect(): Promise<WalletConnectResult>;

  /**
   * Sign a message using the connected wallet.
   * 
   * @param message - Message to sign as Uint8Array
   * @returns Promise resolving to signature as Uint8Array
   */
  signMessage(message: Uint8Array): Promise<Uint8Array>;

  /**
   * Sign a transaction (optional).
   * 
   * @param txBytes - Transaction bytes as Uint8Array
   * @returns Promise resolving to signed transaction bytes as Uint8Array
   */
  signTransaction?(txBytes: Uint8Array): Promise<Uint8Array>;

  /**
   * Get balance for a specific asset.
   * Optional - can be a stub that returns 0.
   * 
   * @param asset_id - Asset ID (e.g., "USDC", "ETH")
   * @returns Promise resolving to balance amount
   */
  getBalance?(asset_id: string): Promise<number>;
}

