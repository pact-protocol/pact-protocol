import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JsonlProviderDirectory } from "../jsonl";
import { unlinkSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("JsonlProviderDirectory", () => {
  let testPath: string;

  beforeEach(() => {
    // Create a unique test file path
    testPath = join(tmpdir(), `pact-providers-test-${Date.now()}.jsonl`);
  });

  afterEach(() => {
    // Clean up test file
    if (existsSync(testPath)) {
      unlinkSync(testPath);
    }
  });

  it("should register and list providers in insertion order", () => {
    const directory = new JsonlProviderDirectory({ path: testPath });

    directory.registerProvider({
      provider_id: "provider-1",
      intentType: "weather.data",
      pubkey_b58: "pubkey1",
    });

    directory.registerProvider({
      provider_id: "provider-2",
      intentType: "weather.data",
      pubkey_b58: "pubkey2",
    });

    directory.registerProvider({
      provider_id: "provider-3",
      intentType: "weather.data",
      pubkey_b58: "pubkey3",
    });

    const providers = directory.listProviders("weather.data");
    expect(providers).toHaveLength(3);
    expect(providers[0].provider_id).toBe("provider-1");
    expect(providers[1].provider_id).toBe("provider-2");
    expect(providers[2].provider_id).toBe("provider-3");
  });

  it("should persist providers and reload them", () => {
    // First directory instance: register providers
    const directory1 = new JsonlProviderDirectory({ path: testPath });
    directory1.registerProvider({
      provider_id: "provider-1",
      intentType: "weather.data",
      pubkey_b58: "pubkey1",
      region: "us-east",
    });
    directory1.registerProvider({
      provider_id: "provider-2",
      intentType: "weather.data",
      pubkey_b58: "pubkey2",
      credentials: ["bonded"],
    });

    // Second directory instance: should load from file
    const directory2 = new JsonlProviderDirectory({ path: testPath });
    const providers = directory2.listProviders("weather.data");
    expect(providers).toHaveLength(2);
    expect(providers[0].provider_id).toBe("provider-1");
    expect(providers[0].region).toBe("us-east");
    expect(providers[1].provider_id).toBe("provider-2");
    expect(providers[1].credentials).toEqual(["bonded"]);
  });

  it("should append new providers to existing file", () => {
    // First directory instance: register provider
    const directory1 = new JsonlProviderDirectory({ path: testPath });
    directory1.registerProvider({
      provider_id: "provider-1",
      intentType: "weather.data",
      pubkey_b58: "pubkey1",
    });

    // Second directory instance: load existing + register new
    const directory2 = new JsonlProviderDirectory({ path: testPath });
    directory2.registerProvider({
      provider_id: "provider-2",
      intentType: "weather.data",
      pubkey_b58: "pubkey2",
    });

    // Third directory instance: should see both
    const directory3 = new JsonlProviderDirectory({ path: testPath });
    const providers = directory3.listProviders("weather.data");
    expect(providers).toHaveLength(2);
    expect(providers[0].provider_id).toBe("provider-1");
    expect(providers[1].provider_id).toBe("provider-2");
  });

  it("should return empty array for unknown intent type", () => {
    const directory = new JsonlProviderDirectory({ path: testPath });

    directory.registerProvider({
      provider_id: "provider-1",
      intentType: "weather.data",
      pubkey_b58: "pubkey1",
    });

    const providers = directory.listProviders("unknown.intent");
    expect(providers).toHaveLength(0);
  });

  it("should handle multiple intent types", () => {
    const directory = new JsonlProviderDirectory({ path: testPath });

    directory.registerProvider({
      provider_id: "provider-1",
      intentType: "weather.data",
      pubkey_b58: "pubkey1",
    });

    directory.registerProvider({
      provider_id: "provider-2",
      intentType: "compute.verify",
      pubkey_b58: "pubkey2",
    });

    expect(directory.listProviders("weather.data")).toHaveLength(1);
    expect(directory.listProviders("compute.verify")).toHaveLength(1);
    expect(directory.listProviders("unknown")).toHaveLength(0);
  });

  it("should ignore malformed lines in JSONL file", () => {
    // Write some malformed lines to the file
    writeFileSync(
      testPath,
      '{"provider_id":"good-1","intentType":"weather.data","pubkey_b58":"pubkey1"}\n' +
        "invalid json line\n" +
        '{"provider_id":"good-2","intentType":"weather.data","pubkey_b58":"pubkey2"}\n' +
        "{ missing fields }\n",
      "utf8"
    );

    const directory = new JsonlProviderDirectory({ path: testPath });
    const providers = directory.listProviders("weather.data");
    expect(providers).toHaveLength(2);
    expect(providers[0].provider_id).toBe("good-1");
    expect(providers[1].provider_id).toBe("good-2");
  });

  it("should throw error when registering provider with missing required fields", () => {
    const directory = new JsonlProviderDirectory({ path: testPath });

    expect(() => {
      directory.registerProvider({
        provider_id: "",
        intentType: "weather.data",
        pubkey_b58: "pubkey1",
      } as any);
    }).toThrow("Provider record missing required fields");

    expect(() => {
      directory.registerProvider({
        provider_id: "provider-1",
        intentType: "",
        pubkey_b58: "pubkey1",
      } as any);
    }).toThrow("Provider record missing required fields");

    expect(() => {
      directory.registerProvider({
        provider_id: "provider-1",
        intentType: "weather.data",
        pubkey_b58: "",
      } as any);
    }).toThrow("Provider record missing required fields");
  });

  it("should deduplicate by provider_id, keeping latest occurrence", () => {
    // Write file with duplicate provider_id but different endpoints
    writeFileSync(
      testPath,
      '{"provider_id":"provider-1","intentType":"weather.data","pubkey_b58":"pubkey1","endpoint":"http://old:7777"}\n' +
        '{"provider_id":"provider-2","intentType":"weather.data","pubkey_b58":"pubkey2"}\n' +
        '{"provider_id":"provider-1","intentType":"weather.data","pubkey_b58":"pubkey1","endpoint":"http://new:8888"}\n',
      "utf8"
    );

    const directory = new JsonlProviderDirectory({ path: testPath });
    const providers = directory.listProviders("weather.data");
    
    // Should have 2 providers (deduplicated)
    expect(providers).toHaveLength(2);
    
    // provider-1 should have the latest endpoint
    const provider1 = providers.find((p) => p.provider_id === "provider-1");
    expect(provider1).toBeDefined();
    expect(provider1!.endpoint).toBe("http://new:8888");
    
    // provider-2 should still be there
    const provider2 = providers.find((p) => p.provider_id === "provider-2");
    expect(provider2).toBeDefined();
  });
});


