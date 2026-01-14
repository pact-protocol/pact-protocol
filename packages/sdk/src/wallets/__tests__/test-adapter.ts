/**
 * Test Wallet Adapter
 * 
 * Simple wallet adapter for testing that always succeeds.
 */

import type { WalletAdapter, Chain, Address, WalletConnectResult, WalletCapabilities, WalletAction, WalletSignature, WalletCapabilitiesResponse } from "../types";
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

  /**
   * Connect to the wallet (v2 Phase 2 Execution Layer).
   * 
   * @returns Promise resolving to void (throws on failure)
   */
  async connect(): Promise<void> {
    // Test adapter always succeeds
  }

  /**
   * Connect to the wallet (legacy method for backward compatibility).
   * 
   * @returns Promise resolving to connection result with address and chain
   * @deprecated Use connect() instead (v2 Phase 2 Execution Layer)
   */
  async connectLegacy(): Promise<WalletConnectResult> {
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
   * @deprecated Use capabilities() instead (v2 Phase 2 Execution Layer)
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

  /**
   * Get wallet capabilities (v2 Phase 2 Execution Layer).
   * 
   * @returns Wallet capabilities including supported chains and assets
   */
  capabilities(): WalletCapabilitiesResponse {
    const chains = this.chain === "solana" ? ["solana"] : 
                   this.chain === "evm" || this.chain === "ethereum" || this.chain === "base" || this.chain === "polygon" || this.chain === "arbitrum" ? 
                   ["evm", "ethereum", "base", "polygon", "arbitrum"] : 
                   [];
    
    return {
      can_sign: true, // Test adapter can sign
      chains,
      assets: ["USDC", "USDT", "ETH", "SOL", "BTC", "HYPE", "XRP"], // Common assets for testing
    };
  }

  /**
   * Sign a wallet action (v2 Phase 2 Execution Layer).
   * Deterministic: returns signature based on stable hash(action + signer).
   * 
   * @param action - Wallet action to sign
   * @returns Promise resolving to wallet signature
   */
  async sign(action: WalletAction): Promise<WalletSignature> {
    const addressHex = bytesToHex(this.address);
    
    // Create deterministic payload hash
    const payload = JSON.stringify({
      action: action.action,
      asset_symbol: action.asset_symbol,
      amount: action.amount,
      from: action.from.toLowerCase(),
      to: action.to.toLowerCase(),
      memo: action.memo || "",
      idempotency_key: action.idempotency_key || "",
    });
    
    const encoder = new TextEncoder();
    const data = encoder.encode(payload);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    
    // Create deterministic signature based on hash(action + signer)
    // Hash: SHA-256(payload_hash + signer_address)
    const signerData = encoder.encode(payload + addressHex);
    const signerHashBuffer = await crypto.subtle.digest("SHA-256", signerData);
    const signerHashArray = Array.from(new Uint8Array(signerHashBuffer));
    
    // Use first 65 bytes (or 64 for Solana) as deterministic signature
    const signatureLength = this.chain === "solana" ? 64 : 65;
    const signature = new Uint8Array(signerHashArray.slice(0, signatureLength));
    
    // Format payload hash based on chain
    let payloadHash: string;
    if (this.chain === "solana") {
      const bs58 = (await import("bs58")).default;
      payloadHash = bs58.encode(hashArray);
    } else {
      payloadHash = "0x" + hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    }
    
    return {
      chain: this.chain,
      signer: addressHex,
      signature,
      payload_hash: payloadHash,
      scheme: this.chain === "solana" ? "ed25519" : "eip191",
    };
  }

  /**
   * Verify a wallet signature (v2 Phase 2 Execution Layer).
   * Deterministic: validates signature format and payload_hash structure.
   * 
   * Note: Full signature byte verification would require async operations.
   * For test adapter, we verify format and payload_hash structure.
   * 
   * @param signature - Wallet signature to verify
   * @param action - Original wallet action
   * @returns true if signature is valid, false otherwise
   */
  verify(signature: WalletSignature, action: WalletAction): boolean {
    // Verify signer matches action.from
    if (signature.signer.toLowerCase() !== action.from.toLowerCase()) {
      return false;
    }
    
    // Verify chain matches
    if (signature.chain !== this.chain) {
      return false;
    }
    
    // Verify scheme matches expected for chain
    const expectedScheme = this.chain === "solana" ? "ed25519" : "eip191";
    if (signature.scheme !== expectedScheme) {
      return false;
    }
    
    // Verify signature length matches expected for scheme
    const expectedLength = this.chain === "solana" ? 64 : 65;
    if (signature.signature.length !== expectedLength) {
      return false;
    }
    
    // Verify payload_hash format matches chain
    if (this.chain === "solana") {
      // Solana uses base58
      if (!signature.payload_hash || signature.payload_hash.length === 0) {
        return false;
      }
    } else {
      // EVM uses hex with 0x prefix
      if (!signature.payload_hash.startsWith("0x")) {
        return false;
      }
    }
    
    // For test adapter, we trust that if format is correct and signer matches, it's valid
    // Full payload_hash recomputation would require async operations
    // In production adapters, this would do full cryptographic verification
    return true;
  }
}

