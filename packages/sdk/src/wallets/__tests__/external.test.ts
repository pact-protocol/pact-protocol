import { describe, it, expect } from "vitest";
import { ExternalWalletAdapter } from "../external";

describe("ExternalWalletAdapter", () => {
  it("should fail to connect when not configured", async () => {
    const adapter = new ExternalWalletAdapter();
    const result = await adapter.connect();
    
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not configured");
  });

  it("should fail to connect when provider is missing", async () => {
    const adapter = new ExternalWalletAdapter({});
    const result = await adapter.connect();
    
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not configured");
  });

  it("should throw when connect is called with provider but not implemented", async () => {
    const adapter = new ExternalWalletAdapter({ provider: "metamask" });
    
    await expect(adapter.connect()).rejects.toThrow("not implemented");
  });

  it("should throw when signMessage is called", async () => {
    const adapter = new ExternalWalletAdapter();
    
    await expect(adapter.signMessage("test message")).rejects.toThrow("not implemented");
  });

  it("should return 0 for getBalance (stub)", async () => {
    const adapter = new ExternalWalletAdapter();
    const balance = await adapter.getBalance?.("USDC");
    
    expect(balance).toBe(0);
  });
});

