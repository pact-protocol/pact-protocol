import { describe, it, expect } from "vitest";
import { getAssetMeta, resolveAssetFromSymbol } from "../registry";
import type { AssetId } from "../types";

describe("getAssetMeta", () => {
  it("should return USDC metadata by default", () => {
    const meta = getAssetMeta();
    expect(meta.asset_id).toBe("USDC");
    expect(meta.decimals).toBe(6);
    expect(meta.chain_id).toBe("solana");
    expect(meta.symbol).toBe("USDC");
  });

  it("should return USDC metadata when undefined", () => {
    const meta = getAssetMeta(undefined);
    expect(meta.asset_id).toBe("USDC");
  });

  it("should return correct metadata for USDC", () => {
    const meta = getAssetMeta("USDC");
    expect(meta.asset_id).toBe("USDC");
    expect(meta.decimals).toBe(6);
    expect(meta.chain_id).toBe("solana");
  });

  it("should return correct metadata for ETH", () => {
    const meta = getAssetMeta("ETH");
    expect(meta.asset_id).toBe("ETH");
    expect(meta.decimals).toBe(18);
    expect(meta.chain_id).toBe("ethereum");
  });

  it("should return correct metadata for BTC", () => {
    const meta = getAssetMeta("BTC");
    expect(meta.asset_id).toBe("BTC");
    expect(meta.decimals).toBe(8);
    expect(meta.chain_id).toBe("unknown");
  });

  it("should return correct metadata for SOL", () => {
    const meta = getAssetMeta("SOL");
    expect(meta.asset_id).toBe("SOL");
    expect(meta.decimals).toBe(9);
    expect(meta.chain_id).toBe("solana");
  });

  it("should return USDC metadata for unknown asset", () => {
    // TypeScript won't allow invalid AssetId, but test runtime behavior
    const meta = getAssetMeta("INVALID" as AssetId);
    expect(meta.asset_id).toBe("USDC");
  });
});

describe("resolveAssetFromSymbol (v2 asset selection)", () => {
  it("should return USDC metadata by default when symbol is not provided", () => {
    const meta = resolveAssetFromSymbol();
    expect(meta.asset_id).toBe("USDC");
    expect(meta.symbol).toBe("USDC");
    expect(meta.decimals).toBe(6);
    expect(meta.chain_id).toBe("solana");
  });

  it("should resolve ETH asset from symbol", () => {
    const meta = resolveAssetFromSymbol("ETH");
    expect(meta.asset_id).toBe("ETH");
    expect(meta.symbol).toBe("ETH");
    expect(meta.decimals).toBe(18);
    expect(meta.chain_id).toBe("ethereum");
  });

  it("should resolve SOL asset from symbol", () => {
    const meta = resolveAssetFromSymbol("SOL");
    expect(meta.asset_id).toBe("SOL");
    expect(meta.symbol).toBe("SOL");
    expect(meta.decimals).toBe(9);
    expect(meta.chain_id).toBe("solana");
  });

  it("should override chain when provided", () => {
    const meta = resolveAssetFromSymbol("ETH", "base");
    expect(meta.asset_id).toBe("ETH");
    expect(meta.symbol).toBe("ETH");
    expect(meta.decimals).toBe(18);
    expect(meta.chain_id).toBe("base");
  });

  it("should override decimals when provided", () => {
    const meta = resolveAssetFromSymbol("USDC", undefined, 8);
    expect(meta.asset_id).toBe("USDC");
    expect(meta.symbol).toBe("USDC");
    expect(meta.decimals).toBe(8);
    expect(meta.chain_id).toBe("solana");
  });

  it("should create synthetic asset for unknown symbol", () => {
    const meta = resolveAssetFromSymbol("CUSTOM", "ethereum", 18);
    expect(meta.asset_id).toBe("USDC"); // Falls back to USDC asset_id
    expect(meta.symbol).toBe("CUSTOM");
    expect(meta.decimals).toBe(18);
    expect(meta.chain_id).toBe("ethereum");
  });
});

