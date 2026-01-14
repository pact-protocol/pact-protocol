import { describe, it, expect, beforeAll } from "vitest";
import { SolanaWalletAdapter, SOLANA_WALLET_KIND, SOLANA_CHAIN, WALLET_CONNECT_FAILED, WALLET_SIGN_FAILED } from "../solana";
import nacl from "tweetnacl";
import bs58 from "bs58";

describe("SolanaWalletAdapter", () => {
  // Fixed deterministic seed for testing
  // This is a test-only seed - never use in production
  const FIXED_SEED = new Uint8Array([
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31
  ]);
  
  // Expected keypair and values (computed deterministically from fixed seed)
  let FIXED_KEYPAIR: nacl.SignKeyPair;
  let EXPECTED_PUBLIC_KEY_BASE58: string;
  let EXPECTED_SIGNATURE_BYTES: Uint8Array;
  let EXPECTED_SIGNATURE_HEX: string;

  // Compute expected values once before tests
  beforeAll(() => {
    // Generate deterministic keypair from fixed seed
    FIXED_KEYPAIR = nacl.sign.keyPair.fromSeed(FIXED_SEED);
    EXPECTED_PUBLIC_KEY_BASE58 = bs58.encode(FIXED_KEYPAIR.publicKey);
    
    // Compute expected signature for "hello" message
    const message = new TextEncoder().encode("hello");
    const signature = nacl.sign.detached(message, FIXED_KEYPAIR.secretKey);
    EXPECTED_SIGNATURE_BYTES = signature;
    EXPECTED_SIGNATURE_HEX = Array.from(signature)
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  });

  // Helper to convert Uint8Array to hex string
  const bytesToHex = (bytes: Uint8Array): string => {
    return "0x" + Array.from(bytes)
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  };

  it("should create deterministic keypair from fixed seed", () => {
    // Create adapter from fixed seed
    const adapter1 = new SolanaWalletAdapter({ secretKey: FIXED_SEED });
    const adapter2 = new SolanaWalletAdapter({ secretKey: FIXED_SEED });
    
    // Both should produce the same keypair
    expect(adapter1["keypair"].publicKey).toEqual(adapter2["keypair"].publicKey);
    expect(adapter1["keypair"].publicKey).toEqual(FIXED_KEYPAIR.publicKey);
  });

  it("should return expected base58 pubkey from getAddress()", async () => {
    const adapter = new SolanaWalletAdapter({ keypair: FIXED_KEYPAIR });
    const addressInfo = await adapter.getAddress();
    
    // getAddress() returns { chain, value }
    expect(addressInfo.chain).toBe("solana");
    expect(addressInfo.value).toBe(EXPECTED_PUBLIC_KEY_BASE58);
    // Base58 public key should be valid format (32 bytes encoded as base58)
    expect(addressInfo.value.length).toBeGreaterThan(30);
    expect(addressInfo.value.length).toBeLessThan(50);
    // Verify it's valid base58
    const decoded = bs58.decode(addressInfo.value);
    expect(decoded.length).toBe(32); // Public key is 32 bytes
  });

  it("should produce stable signature for signMessage('hello')", async () => {
    const adapter = new SolanaWalletAdapter({ keypair: FIXED_KEYPAIR });
    const message = new TextEncoder().encode("hello");
    
    // Sign the message
    const signature = await adapter.signMessage(message);
    
    // Assert signature is Uint8Array with correct length (64 bytes for ed25519)
    expect(signature).toBeInstanceOf(Uint8Array);
    expect(signature.length).toBe(64);
    
    // Assert signature matches expected bytes exactly
    expect(signature).toEqual(EXPECTED_SIGNATURE_BYTES);
    
    // Also verify hex representation matches
    const signatureHex = bytesToHex(signature);
    expect(signatureHex.slice(2)).toBe(EXPECTED_SIGNATURE_HEX);
    expect(signatureHex).toMatch(/^0x[a-fA-F0-9]{128}$/); // 64 bytes = 128 hex chars
    
    // Sign multiple times - should produce same signature (deterministic)
    const signature2 = await adapter.signMessage(message);
    const signature3 = await adapter.signMessage(message);
    expect(signature).toEqual(signature2);
    expect(signature2).toEqual(signature3);
  });

  it("should sign opaque bytes with signTransaction()", async () => {
    const adapter = new SolanaWalletAdapter({ keypair: FIXED_KEYPAIR });
    // Use opaque transaction bytes (not a real Solana transaction, just bytes)
    const txBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    
    // Sign the transaction bytes
    const signature = await adapter.signTransaction(txBytes);
    
    // Assert signature is Uint8Array with correct length (64 bytes for ed25519)
    expect(signature).toBeInstanceOf(Uint8Array);
    expect(signature.length).toBe(64);
    
    // Sign again - should produce same signature (deterministic)
    const signature2 = await adapter.signTransaction(txBytes);
    expect(signature).toEqual(signature2);
    
    // Different bytes should produce different signature
    const differentTxBytes = new Uint8Array([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    const differentSignature = await adapter.signTransaction(differentTxBytes);
    expect(signature).not.toEqual(differentSignature);
  });

  it("should return chain from getChain()", () => {
    const adapter = new SolanaWalletAdapter({ keypair: FIXED_KEYPAIR });
    expect(adapter.getChain()).toBe("solana");
    expect(adapter.chain).toBe("solana");
    expect(adapter.kind).toBe("solana-keypair");
  });

  it("should create wallet from keypair", async () => {
    const adapter = new SolanaWalletAdapter({ keypair: FIXED_KEYPAIR });
    const addressInfo = await adapter.getAddress();
    
    expect(addressInfo.value).toBe(EXPECTED_PUBLIC_KEY_BASE58);
    expect(addressInfo.chain).toBe("solana");
  });

  it("should create wallet from 64-byte secretKey", async () => {
    const adapter = new SolanaWalletAdapter({ secretKey: FIXED_KEYPAIR.secretKey });
    const addressInfo = await adapter.getAddress();
    
    expect(addressInfo.value).toBe(EXPECTED_PUBLIC_KEY_BASE58);
    expect(addressInfo.chain).toBe("solana");
  });

  it("should create wallet from 32-byte seed", async () => {
    // Extract seed (first 32 bytes of secretKey)
    const seed = FIXED_KEYPAIR.secretKey.slice(0, 32);
    const adapter = new SolanaWalletAdapter({ secretKey: seed });
    const addressInfo = await adapter.getAddress();
    
    // Should generate same keypair from seed
    expect(addressInfo.value).toBe(EXPECTED_PUBLIC_KEY_BASE58);
    expect(addressInfo.chain).toBe("solana");
  });

  it("should throw if neither keypair nor secretKey provided", () => {
    expect(() => {
      new SolanaWalletAdapter({});
    }).toThrow("SolanaWalletAdapter requires either keypair or secretKey option");
  });

  it("should throw if secretKey has invalid length", () => {
    const invalidSecretKey = new Uint8Array(31);
    expect(() => {
      new SolanaWalletAdapter({ secretKey: invalidSecretKey });
    }).toThrow("SolanaWalletAdapter secretKey must be 32 or 64 bytes");
  });

  it("should connect successfully", async () => {
    const adapter = new SolanaWalletAdapter({ keypair: FIXED_KEYPAIR });
    const result = await adapter.connect();
    
    expect(result.ok).toBe(true);
    expect(result.address).toBeInstanceOf(Uint8Array);
    // Address should be the base58-decoded public key
    const decodedAddress = bs58.decode(EXPECTED_PUBLIC_KEY_BASE58);
    expect(result.address).toEqual(decodedAddress);
    expect(result.chain).toBe("solana");
  });

  it("should sign transaction bytes", async () => {
    const adapter = new SolanaWalletAdapter({ keypair: FIXED_KEYPAIR });
    const txBytes = new TextEncoder().encode("transaction data");
    const signature = await adapter.signTransaction(txBytes);
    
    expect(signature).toBeInstanceOf(Uint8Array);
    expect(signature.length).toBe(64); // ed25519 signature is 64 bytes
    
    // Sign again - should be identical (deterministic)
    const signature2 = await adapter.signTransaction(txBytes);
    expect(signature).toEqual(signature2);
  });

  it("should handle signing correctly", async () => {
    const adapter = new SolanaWalletAdapter({ keypair: FIXED_KEYPAIR });
    const message = new TextEncoder().encode("test");
    
    // Signing should work with valid keypair
    const signature = await adapter.signMessage(message);
    expect(signature).toBeInstanceOf(Uint8Array);
    expect(signature.length).toBe(64);
    
    // Signing same message should produce same signature (deterministic)
    const signature2 = await adapter.signMessage(message);
    expect(signature).toEqual(signature2);
  });

  it("should return 0 for getBalance (stub, no provider)", async () => {
    const adapter = new SolanaWalletAdapter({ keypair: FIXED_KEYPAIR });
    const balance = await adapter.getBalance("SOL");
    
    expect(balance).toBe(0);
  });

  it("should export constants", () => {
    expect(SOLANA_WALLET_KIND).toBe("solana-keypair");
    expect(SOLANA_CHAIN).toBe("solana");
    expect(WALLET_CONNECT_FAILED).toBe("WALLET_CONNECT_FAILED");
    expect(WALLET_SIGN_FAILED).toBe("WALLET_SIGN_FAILED");
  });
});

