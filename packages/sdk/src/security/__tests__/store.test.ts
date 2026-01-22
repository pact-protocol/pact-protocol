/**
 * Secure Store Tests (v2 Phase 4)
 * 
 * Tests for FileSecureStore encrypted key-value storage.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { FileSecureStore } from "../store";

describe("FileSecureStore", () => {
  let tempDir: string;
  let store: FileSecureStore;
  const testPassphrase = "test-passphrase-123";
  
  beforeEach(() => {
    // Create temporary directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pact-secure-test-"));
    store = new FileSecureStore({
      baseDir: tempDir,
      passphrase: testPassphrase,
    });
  });
  
  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
  
  describe("put / get", () => {
    it("should store and retrieve a simple value", async () => {
      await store.put("test-key", "test-value");
      const value = await store.get<string>("test-key");
      
      expect(value).toBe("test-value");
    });
    
    it("should store and retrieve an object", async () => {
      const obj = { name: "test", count: 42, nested: { value: "nested" } };
      await store.put("test-obj", obj);
      const retrieved = await store.get<typeof obj>("test-obj");
      
      expect(retrieved).toEqual(obj);
    });
    
    it("should store and retrieve an array", async () => {
      const arr = [1, 2, 3, "test"];
      await store.put("test-arr", arr);
      const retrieved = await store.get<typeof arr>("test-arr");
      
      expect(retrieved).toEqual(arr);
    });
    
    it("should return null for non-existent key", async () => {
      const value = await store.get("non-existent");
      expect(value).toBeNull();
    });
    
    it("should overwrite existing value", async () => {
      await store.put("key", "value1");
      await store.put("key", "value2");
      const value = await store.get<string>("key");
      
      expect(value).toBe("value2");
    });
  });
  
  describe("del", () => {
    it("should delete a stored value", async () => {
      await store.put("key", "value");
      await store.del("key");
      
      const value = await store.get("key");
      expect(value).toBeNull();
    });
    
    it("should not error when deleting non-existent key", async () => {
      await expect(store.del("non-existent")).resolves.not.toThrow();
    });
  });
  
  describe("list", () => {
    it("should list all keys", async () => {
      await store.put("key1", "value1");
      await store.put("key2", "value2");
      await store.put("key3", "value3");
      
      const keys = await store.list();
      expect(keys.sort()).toEqual(["key1", "key2", "key3"]);
    });
    
    it("should filter keys by prefix", async () => {
      await store.put("prefix-key1", "value1");
      await store.put("prefix-key2", "value2");
      await store.put("other-key", "value3");
      
      const keys = await store.list("prefix-");
      expect(keys.sort()).toEqual(["prefix-key1", "prefix-key2"]);
    });
    
    it("should return empty array when no keys exist", async () => {
      const keys = await store.list();
      expect(keys).toEqual([]);
    });
  });
  
  describe("encryption", () => {
    it("should not be readable without passphrase", async () => {
      await store.put("secret-key", "secret-value");
      
      // Try to create a new store with wrong passphrase
      const wrongStore = new FileSecureStore({
        baseDir: tempDir,
        passphrase: "wrong-passphrase",
      });
      
      // Should fail to decrypt
      await expect(wrongStore.get("secret-key")).rejects.toThrow("Failed to decrypt");
    });
    
    it("should be readable with correct passphrase", async () => {
      await store.put("secret-key", "secret-value");
      
      // Create a new store with same passphrase (should work)
      const newStore = new FileSecureStore({
        baseDir: tempDir,
        passphrase: testPassphrase,
      });
      
      const value = await newStore.get<string>("secret-key");
      expect(value).toBe("secret-value");
    });
    
    it("should use same salt file across instances", async () => {
      await store.put("key1", "value1");
      
      // Create new instance - should use same salt
      const store2 = new FileSecureStore({
        baseDir: tempDir,
        passphrase: testPassphrase,
      });
      
      // Should be able to read
      const value = await store2.get<string>("key1");
      expect(value).toBe("value1");
    });
  });
  
  describe("key sanitization", () => {
    it("should sanitize invalid filesystem characters", async () => {
      await store.put("key/with/slashes", "value1");
      await store.put("key\\with\\backslashes", "value2");
      await store.put("key:with:colons", "value3");
      
      // All should be stored and retrievable
      expect(await store.get("key/with/slashes")).toBe("value1");
      expect(await store.get("key\\with\\backslashes")).toBe("value2");
      expect(await store.get("key:with:colons")).toBe("value3");
    });
  });
  
  describe("environment variable", () => {
    it("should use PACT_SECURESTORE_PASSPHRASE from env", async () => {
      const originalEnv = process.env.PACT_SECURESTORE_PASSPHRASE;
      try {
        process.env.PACT_SECURESTORE_PASSPHRASE = "env-passphrase";
        
        const envStore = new FileSecureStore({
          baseDir: tempDir,
        });
        
        await envStore.put("key", "value");
        const retrieved = await envStore.get<string>("key");
        expect(retrieved).toBe("value");
      } finally {
        if (originalEnv) {
          process.env.PACT_SECURESTORE_PASSPHRASE = originalEnv;
        } else {
          delete process.env.PACT_SECURESTORE_PASSPHRASE;
        }
      }
    });
    
    it("should work without passphrase (encryption disabled)", async () => {
      const originalEnv = process.env.PACT_SECURESTORE_PASSPHRASE;
      const originalLocalKey = process.env.PACT_LOCAL_KEY;
      try {
        delete process.env.PACT_SECURESTORE_PASSPHRASE;
        delete process.env.PACT_LOCAL_KEY;
        
        // Should work without passphrase (encryption disabled)
        const store = new FileSecureStore({ baseDir: tempDir });
        await store.put("key", "value");
        const value = await store.get<string>("key");
        expect(value).toBe("value");
      } finally {
        if (originalEnv) {
          process.env.PACT_SECURESTORE_PASSPHRASE = originalEnv;
        }
        if (originalLocalKey) {
          process.env.PACT_LOCAL_KEY = originalLocalKey;
        }
      }
    });
    
    it("should throw if requirePassphrase is true and no passphrase", () => {
      const originalEnv = process.env.PACT_SECURESTORE_PASSPHRASE;
      const originalLocalKey = process.env.PACT_LOCAL_KEY;
      try {
        delete process.env.PACT_SECURESTORE_PASSPHRASE;
        delete process.env.PACT_LOCAL_KEY;
        
        expect(() => {
          new FileSecureStore({ baseDir: tempDir, requirePassphrase: true });
        }).toThrow("requires passphrase");
      } finally {
        if (originalEnv) {
          process.env.PACT_SECURESTORE_PASSPHRASE = originalEnv;
        }
        if (originalLocalKey) {
          process.env.PACT_LOCAL_KEY = originalLocalKey;
        }
      }
    });
    
    it("should use PACT_LOCAL_KEY if available", async () => {
      const originalEnv = process.env.PACT_SECURESTORE_PASSPHRASE;
      const originalLocalKey = process.env.PACT_LOCAL_KEY;
      try {
        delete process.env.PACT_SECURESTORE_PASSPHRASE;
        process.env.PACT_LOCAL_KEY = "local-key-123";
        
        const store = new FileSecureStore({ baseDir: tempDir });
        await store.put("key", "value");
        const value = await store.get<string>("key");
        expect(value).toBe("value");
      } finally {
        if (originalEnv) {
          process.env.PACT_SECURESTORE_PASSPHRASE = originalEnv;
        }
        if (originalLocalKey) {
          process.env.PACT_LOCAL_KEY = originalLocalKey;
        } else {
          delete process.env.PACT_LOCAL_KEY;
        }
      }
    });
  });
});
