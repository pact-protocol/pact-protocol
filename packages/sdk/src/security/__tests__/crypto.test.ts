/**
 * Cryptographic Utilities Tests (v2 Phase 4)
 * 
 * Tests for AES-256-GCM encryption/decryption and key derivation.
 */

import { describe, it, expect } from "vitest";
import {
  deriveKeyFromPassphrase,
  encryptBytes,
  decryptBytes,
  base64urlEncode,
  base64urlDecode,
} from "../crypto";

describe("deriveKeyFromPassphrase", () => {
  it("should derive a 32-byte key from passphrase", () => {
    const passphrase = "test-passphrase-123";
    const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    
    const key = deriveKeyFromPassphrase(passphrase, salt);
    
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
  });
  
  it("should derive same key for same passphrase and salt", () => {
    const passphrase = "test-passphrase";
    const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    
    const key1 = deriveKeyFromPassphrase(passphrase, salt);
    const key2 = deriveKeyFromPassphrase(passphrase, salt);
    
    expect(key1).toEqual(key2);
  });
  
  it("should derive different keys for different salts", () => {
    const passphrase = "test-passphrase";
    const salt1 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const salt2 = new Uint8Array([16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    
    const key1 = deriveKeyFromPassphrase(passphrase, salt1);
    const key2 = deriveKeyFromPassphrase(passphrase, salt2);
    
    expect(key1).not.toEqual(key2);
  });
  
  it("should derive different keys for different passphrases", () => {
    const passphrase1 = "passphrase-1";
    const passphrase2 = "passphrase-2";
    const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    
    const key1 = deriveKeyFromPassphrase(passphrase1, salt);
    const key2 = deriveKeyFromPassphrase(passphrase2, salt);
    
    expect(key1).not.toEqual(key2);
  });
});

describe("encryptBytes / decryptBytes", () => {
  it("should encrypt and decrypt plaintext successfully", () => {
    const plaintext = new TextEncoder().encode("Hello, World!");
    const key = new Uint8Array(32).fill(42); // Deterministic key for testing
    
    const { ciphertext, iv, tag } = encryptBytes(plaintext, key);
    
    expect(ciphertext).toBeInstanceOf(Uint8Array);
    expect(iv).toBeInstanceOf(Uint8Array);
    expect(tag).toBeInstanceOf(Uint8Array);
    expect(iv.length).toBe(12);
    expect(tag.length).toBe(16);
    expect(ciphertext.length).toBeGreaterThan(0);
    
    const decrypted = decryptBytes(ciphertext, key, iv, tag);
    expect(decrypted).toEqual(plaintext);
  });
  
  it("should produce different ciphertext for same plaintext (IV is random)", () => {
    const plaintext = new TextEncoder().encode("Same message");
    const key = new Uint8Array(32).fill(42);
    
    const result1 = encryptBytes(plaintext, key);
    const result2 = encryptBytes(plaintext, key);
    
    // IVs should be different (random)
    expect(result1.iv).not.toEqual(result2.iv);
    // Ciphertexts should be different
    expect(result1.ciphertext).not.toEqual(result2.ciphertext);
    // Tags should be different
    expect(result1.tag).not.toEqual(result2.tag);
    
    // But both should decrypt to same plaintext
    const decrypted1 = decryptBytes(result1.ciphertext, key, result1.iv, result1.tag);
    const decrypted2 = decryptBytes(result2.ciphertext, key, result2.iv, result2.tag);
    expect(decrypted1).toEqual(plaintext);
    expect(decrypted2).toEqual(plaintext);
  });
  
  it("should fail to decrypt with wrong key", () => {
    const plaintext = new TextEncoder().encode("Secret message");
    const key1 = new Uint8Array(32).fill(42);
    const key2 = new Uint8Array(32).fill(99);
    
    const { ciphertext, iv, tag } = encryptBytes(plaintext, key1);
    
    expect(() => {
      decryptBytes(ciphertext, key2, iv, tag);
    }).toThrow("Decryption failed");
  });
  
  it("should fail to decrypt with tampered tag", () => {
    const plaintext = new TextEncoder().encode("Secret message");
    const key = new Uint8Array(32).fill(42);
    
    const { ciphertext, iv, tag } = encryptBytes(plaintext, key);
    
    // Tamper with tag
    const tamperedTag = new Uint8Array(tag);
    tamperedTag[0] = (tamperedTag[0] + 1) % 256;
    
    expect(() => {
      decryptBytes(ciphertext, key, iv, tamperedTag);
    }).toThrow("Decryption failed");
  });
  
  it("should fail to decrypt with tampered ciphertext", () => {
    const plaintext = new TextEncoder().encode("Secret message");
    const key = new Uint8Array(32).fill(42);
    
    const { ciphertext, iv, tag } = encryptBytes(plaintext, key);
    
    // Tamper with ciphertext
    const tamperedCiphertext = new Uint8Array(ciphertext);
    tamperedCiphertext[0] = (tamperedCiphertext[0] + 1) % 256;
    
    expect(() => {
      decryptBytes(tamperedCiphertext, key, iv, tag);
    }).toThrow("Decryption failed");
  });
  
  it("should fail to decrypt with wrong IV", () => {
    const plaintext = new TextEncoder().encode("Secret message");
    const key = new Uint8Array(32).fill(42);
    
    const { ciphertext, iv, tag } = encryptBytes(plaintext, key);
    
    // Use wrong IV
    const wrongIv = new Uint8Array(12).fill(99);
    
    expect(() => {
      decryptBytes(ciphertext, key, wrongIv, tag);
    }).toThrow("Decryption failed");
  });
  
  it("should support AAD (additional authenticated data)", () => {
    const plaintext = new TextEncoder().encode("Secret message");
    const key = new Uint8Array(32).fill(42);
    const aad = new TextEncoder().encode("metadata");
    
    const { ciphertext, iv, tag } = encryptBytes(plaintext, key, aad);
    
    // Decrypt with correct AAD
    const decrypted = decryptBytes(ciphertext, key, iv, tag, aad);
    expect(decrypted).toEqual(plaintext);
    
    // Decrypt with wrong AAD should fail
    const wrongAad = new TextEncoder().encode("wrong-metadata");
    expect(() => {
      decryptBytes(ciphertext, key, iv, tag, wrongAad);
    }).toThrow("Decryption failed");
  });
  
  it("should handle empty plaintext", () => {
    const plaintext = new Uint8Array(0);
    const key = new Uint8Array(32).fill(42);
    
    const { ciphertext, iv, tag } = encryptBytes(plaintext, key);
    const decrypted = decryptBytes(ciphertext, key, iv, tag);
    
    expect(decrypted).toEqual(plaintext);
  });
  
  it("should handle large plaintext", () => {
    const plaintext = new Uint8Array(10000).fill(65); // 10KB of 'A'
    const key = new Uint8Array(32).fill(42);
    
    const { ciphertext, iv, tag } = encryptBytes(plaintext, key);
    const decrypted = decryptBytes(ciphertext, key, iv, tag);
    
    expect(decrypted).toEqual(plaintext);
  });
  
  it("should reject invalid key length", () => {
    const plaintext = new TextEncoder().encode("test");
    const wrongKey = new Uint8Array(16); // Wrong length
    
    expect(() => {
      encryptBytes(plaintext, wrongKey);
    }).toThrow("Key must be 32 bytes");
  });
  
  it("should reject invalid IV length", () => {
    const ciphertext = new Uint8Array(10);
    const key = new Uint8Array(32).fill(42);
    const wrongIv = new Uint8Array(8); // Wrong length
    const tag = new Uint8Array(16);
    
    expect(() => {
      decryptBytes(ciphertext, key, wrongIv, tag);
    }).toThrow("IV must be 12 bytes");
  });
  
  it("should reject invalid tag length", () => {
    const ciphertext = new Uint8Array(10);
    const key = new Uint8Array(32).fill(42);
    const iv = new Uint8Array(12);
    const wrongTag = new Uint8Array(8); // Wrong length
    
    expect(() => {
      decryptBytes(ciphertext, key, iv, wrongTag);
    }).toThrow("Tag must be 16 bytes");
  });
});

describe("base64urlEncode / base64urlDecode", () => {
  it("should encode and decode bytes correctly", () => {
    const bytes = new Uint8Array([0, 1, 2, 255, 128, 64]);
    const encoded = base64urlEncode(bytes);
    const decoded = base64urlDecode(encoded);
    
    expect(decoded).toEqual(bytes);
  });
  
  it("should produce URL-safe encoding (no + or /)", () => {
    const bytes = new Uint8Array([251, 239, 191]); // Bytes that produce + and / in base64
    const encoded = base64urlEncode(bytes);
    
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");
  });
  
  it("should handle empty bytes", () => {
    const bytes = new Uint8Array(0);
    const encoded = base64urlEncode(bytes);
    const decoded = base64urlDecode(encoded);
    
    expect(decoded).toEqual(bytes);
  });
  
  it("should round-trip various byte values", () => {
    const testCases = [
      new Uint8Array([0]),
      new Uint8Array([255]),
      new Uint8Array([0, 255]),
      new Uint8Array([1, 2, 3, 4, 5]),
      new Uint8Array([128, 129, 130]),
    ];
    
    for (const bytes of testCases) {
      const encoded = base64urlEncode(bytes);
      const decoded = base64urlDecode(encoded);
      expect(decoded).toEqual(bytes);
    }
  });
  
  it("should reject invalid base64url string", () => {
    expect(() => {
      base64urlDecode("invalid!@#$");
    }).toThrow("Invalid base64url string");
  });
});
