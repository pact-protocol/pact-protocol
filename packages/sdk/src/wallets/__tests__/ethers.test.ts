import { describe, it, expect, beforeAll } from "vitest";
import { EthersWalletAdapter, WALLET_CONNECT_FAILED, WALLET_SIGN_FAILED } from "../ethers";

describe("EthersWalletAdapter", () => {
  // Fixed deterministic private key for testing
  // This is a test-only private key - never use in production
  const FIXED_PRIVATE_KEY = "0x59c6995e998f97a5a0044976f094538c5f4f7e2f3c0d6b5e0c3e2d1b1a0f0001";
  
  // Expected address for the fixed private key (computed deterministically)
  // This is the address that ethers v6 will generate from the private key
  let EXPECTED_ADDRESS: string;
  
  // Expected signature for "hello" message (computed deterministically)
  // This is the signature that ethers v6 will generate for the UTF-8 encoded "hello" message
  let EXPECTED_SIGNATURE_HEX: string;
  let EXPECTED_SIGNATURE_BYTES: Uint8Array;

  // Compute expected address and signature once before tests
  beforeAll(async () => {
    const { Wallet } = await import("ethers");
    const wallet = new Wallet(FIXED_PRIVATE_KEY);
    EXPECTED_ADDRESS = wallet.address;
    
    // Compute expected signature for "hello" message
    const message = new TextEncoder().encode("hello");
    const signatureHex = await wallet.signMessage(message);
    EXPECTED_SIGNATURE_HEX = signatureHex;
    EXPECTED_SIGNATURE_BYTES = hexToBytes(signatureHex);
  });

  // Helper to convert Uint8Array to hex string
  const bytesToHex = (bytes: Uint8Array): string => {
    return "0x" + Array.from(bytes)
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  };

  // Helper to convert hex string to Uint8Array
  const hexToBytes = (hex: string): Uint8Array => {
    const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
    }
    return bytes;
  };

  it("should return expected address from getAddress()", async () => {
    const adapter = new EthersWalletAdapter({ privateKey: FIXED_PRIVATE_KEY });
    const addressInfo = await adapter.getAddress();
    
    // getAddress() returns { chain, value }
    expect(addressInfo.chain).toBe("evm");
    expect(addressInfo.value).toMatch(/^0x[a-fA-F0-9]{40}$/);
    // Assert exact address match (case-insensitive comparison for checksummed addresses)
    expect(addressInfo.value.toLowerCase()).toBe(EXPECTED_ADDRESS.toLowerCase());
    // For deterministic testing, we can also check the exact value if needed
    expect(addressInfo.value).toBe(EXPECTED_ADDRESS);
  });

  it("should return expected signature for utf8('hello') message", async () => {
    const adapter = new EthersWalletAdapter({ privateKey: FIXED_PRIVATE_KEY });
    const message = new TextEncoder().encode("hello");
    
    // Sign the message
    const signature = await adapter.signMessage(message);
    
    // Assert signature is Uint8Array with correct length
    expect(signature).toBeInstanceOf(Uint8Array);
    expect(signature.length).toBe(65); // Standard ECDSA signature length
    
    // Assert signature matches expected bytes exactly
    expect(signature).toEqual(EXPECTED_SIGNATURE_BYTES);
    
    // Also verify hex representation matches
    const signatureHex = bytesToHex(signature);
    expect(signatureHex).toBe(EXPECTED_SIGNATURE_HEX);
    expect(signatureHex).toMatch(/^0x[a-fA-F0-9]{130}$/);
    
    // Sign multiple times - should produce same signature (deterministic)
    const signature2 = await adapter.signMessage(message);
    const signature3 = await adapter.signMessage(message);
    expect(signature).toEqual(signature2);
    expect(signature2).toEqual(signature3);
  });

  it("should return chain from getChain()", () => {
    const adapter = new EthersWalletAdapter({ privateKey: FIXED_PRIVATE_KEY });
    expect(adapter.getChain()).toBe("evm");
    expect(adapter.chain).toBe("evm");
    expect(adapter.kind).toBe("ethers");
  });

  it("should create wallet from existing ethers.Wallet", async () => {
    const { Wallet } = await import("ethers");
    const wallet = new Wallet(FIXED_PRIVATE_KEY);
    const adapter = new EthersWalletAdapter({ wallet });
    
    const addressInfo = await adapter.getAddress();
    // Address comparison should be case-insensitive (ethers uses checksummed addresses)
    expect(addressInfo.value.toLowerCase()).toBe(EXPECTED_ADDRESS.toLowerCase());
    expect(addressInfo.value.toLowerCase()).toBe(wallet.address.toLowerCase());
    expect(addressInfo.chain).toBe("evm");
  });

  it("should throw if neither privateKey nor wallet provided", () => {
    expect(() => {
      new EthersWalletAdapter({});
    }).toThrow("EthersWalletAdapter requires either privateKey or wallet option");
  });

  it("should connect successfully", async () => {
    const adapter = new EthersWalletAdapter({ privateKey: FIXED_PRIVATE_KEY });
    const result = await adapter.connect();
    
    expect(result.ok).toBe(true);
    expect(result.address).toBeInstanceOf(Uint8Array);
    // Address comparison should be case-insensitive (ethers uses checksummed addresses)
    expect(bytesToHex(result.address!).toLowerCase()).toBe(EXPECTED_ADDRESS.toLowerCase());
    expect(result.chain).toBe("evm");
  });

  it("should sign Uint8Array message deterministically", async () => {
    const adapter = new EthersWalletAdapter({ privateKey: FIXED_PRIVATE_KEY });
    const message = new TextEncoder().encode("Hello, World!");
    const signature = await adapter.signMessage(message);
    
    expect(signature).toBeInstanceOf(Uint8Array);
    expect(signature.length).toBe(65);
    
    // Sign again - should be identical
    const signature2 = await adapter.signMessage(message);
    expect(signature).toEqual(signature2);
    
    // Convert to hex for format check
    const signatureHex = bytesToHex(signature);
    expect(signatureHex).toMatch(/^0x[a-fA-F0-9]{130}$/);
  });

  it("should sign hex bytes message deterministically", async () => {
    const adapter = new EthersWalletAdapter({ privateKey: FIXED_PRIVATE_KEY });
    const message = hexToBytes("0x48656c6c6f"); // "Hello" in hex
    const signature = await adapter.signMessage(message);
    
    expect(signature).toBeInstanceOf(Uint8Array);
    expect(signature.length).toBe(65);
    
    // Sign again - should be identical
    const signature2 = await adapter.signMessage(message);
    expect(signature).toEqual(signature2);
  });

  it("should throw WALLET_SIGN_FAILED on sign error", async () => {
    const adapter = new EthersWalletAdapter({ privateKey: FIXED_PRIVATE_KEY });
    const message = new TextEncoder().encode("test");
    
    // Create an invalid wallet by replacing the signMessage method
    adapter["wallet"].signMessage = async () => {
      throw new Error("Signing failed");
    };
    
    await expect(adapter.signMessage(message)).rejects.toThrow(WALLET_SIGN_FAILED);
  });

  it("should return 0 for getBalance (stub, no provider)", async () => {
    const adapter = new EthersWalletAdapter({ privateKey: FIXED_PRIVATE_KEY });
    const balance = await adapter.getBalance("ETH");
    
    expect(balance).toBe(0);
  });

  it("should handle private key without 0x prefix", async () => {
    const privateKeyWithoutPrefix = FIXED_PRIVATE_KEY.slice(2);
    const adapter = new EthersWalletAdapter({ privateKey: privateKeyWithoutPrefix });
    
    const addressInfo = await adapter.getAddress();
    // Address comparison should be case-insensitive (ethers uses checksummed addresses)
    expect(addressInfo.value.toLowerCase()).toBe(EXPECTED_ADDRESS.toLowerCase());
    expect(addressInfo.chain).toBe("evm");
  });

  it("should export error constants", () => {
    expect(WALLET_CONNECT_FAILED).toBe("WALLET_CONNECT_FAILED");
    expect(WALLET_SIGN_FAILED).toBe("WALLET_SIGN_FAILED");
  });
});

