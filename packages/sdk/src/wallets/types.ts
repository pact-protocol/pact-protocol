/**
 * Wallet Adapter Types
 * 
 * Interface for wallet adapters to enable future integrations with
 * MetaMask, Coinbase Wallet, etc. This is a seam for wallet connectivity.
 */

export interface WalletConnectResult {
  ok: boolean;
  address?: string;
  chain_id?: string;
  error?: string;
}

export interface WalletAdapter {
  /**
   * Connect to the wallet.
   * 
   * @returns Promise resolving to connection result with address and chain_id
   */
  connect(): Promise<WalletConnectResult>;

  /**
   * Sign a message using the connected wallet.
   * 
   * @param message - Message to sign (hex string or bytes)
   * @returns Promise resolving to signature (hex string)
   */
  signMessage(message: string | Uint8Array): Promise<string>;

  /**
   * Get balance for a specific asset.
   * Optional - can be a stub that returns 0.
   * 
   * @param asset_id - Asset ID (e.g., "USDC", "ETH")
   * @returns Promise resolving to balance amount
   */
  getBalance?(asset_id: string): Promise<number>;
}

