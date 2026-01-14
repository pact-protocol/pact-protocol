import { describe, it, expect } from "vitest";
import { ExternalWalletAdapter } from "../external";

describe("ExternalWalletAdapter", () => {
  it("should fail to connect when not configured (v2 Phase 2 Execution Layer)", async () => {
    const adapter = new ExternalWalletAdapter();
    // v2 Phase 2 Execution Layer: connect() throws on failure
    await expect(adapter.connect()).rejects.toThrow("not configured");
  });

  it("should fail to connect when provider is missing (v2 Phase 2 Execution Layer)", async () => {
    const adapter = new ExternalWalletAdapter({});
    // v2 Phase 2 Execution Layer: connect() throws on failure
    await expect(adapter.connect()).rejects.toThrow("not configured");
  });

  it("should throw when connect is called with provider but not implemented", async () => {
    const adapter = new ExternalWalletAdapter({ provider: "metamask" });
    
    await expect(adapter.connect()).rejects.toThrow("not implemented");
  });

  it("should throw when signMessage is called", async () => {
    const adapter = new ExternalWalletAdapter();
    const message = new TextEncoder().encode("test message");
    
    await expect(adapter.signMessage(message)).rejects.toThrow("not implemented");
  });

  it("should return chain from getChain()", () => {
    const adapter = new ExternalWalletAdapter();
    expect(adapter.getChain()).toBe("ethereum");
    
    const adapterBase = new ExternalWalletAdapter({ chain: "base" });
    expect(adapterBase.getChain()).toBe("base");
  });

  it("should throw when getAddress() is called before connect", async () => {
    const adapter = new ExternalWalletAdapter();
    
    await expect(adapter.getAddress()).rejects.toThrow("not connected");
  });

  it("should have kind property", () => {
    const adapter = new ExternalWalletAdapter();
    expect(adapter.kind).toBe("external");
  });

  it("should return 0 for getBalance (stub)", async () => {
    const adapter = new ExternalWalletAdapter();
    const balance = await adapter.getBalance?.("USDC");
    
    expect(balance).toBe(0);
  });
});

