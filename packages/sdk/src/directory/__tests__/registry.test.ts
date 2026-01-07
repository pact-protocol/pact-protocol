import { describe, it, expect } from "vitest";
import { InMemoryProviderDirectory } from "../registry";

describe("InMemoryProviderDirectory", () => {
  it("should register and list providers in insertion order", () => {
    const directory = new InMemoryProviderDirectory();

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

  it("should return empty array for unknown intent type", () => {
    const directory = new InMemoryProviderDirectory();

    directory.registerProvider({
      provider_id: "provider-1",
      intentType: "weather.data",
      pubkey_b58: "pubkey1",
    });

    const providers = directory.listProviders("unknown.intent");
    expect(providers).toHaveLength(0);
  });

  it("should handle multiple intent types", () => {
    const directory = new InMemoryProviderDirectory();

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
});



