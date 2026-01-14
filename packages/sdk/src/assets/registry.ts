/**
 * Asset Registry
 * 
 * Static registry of asset metadata. Default asset is USDC.
 */

import type { AssetId, AssetMeta, ChainId } from "./types";

const ASSET_REGISTRY: Record<AssetId, AssetMeta> = {
  USDC: {
    asset_id: "USDC",
    decimals: 6,
    chain_id: "solana",
    symbol: "USDC",
  },
  USDT: {
    asset_id: "USDT",
    decimals: 6,
    chain_id: "solana",
    symbol: "USDT",
  },
  BTC: {
    asset_id: "BTC",
    decimals: 8,
    chain_id: "unknown",
    symbol: "BTC",
  },
  ETH: {
    asset_id: "ETH",
    decimals: 18,
    chain_id: "ethereum",
    symbol: "ETH",
  },
  SOL: {
    asset_id: "SOL",
    decimals: 9,
    chain_id: "solana",
    symbol: "SOL",
  },
  HYPE: {
    asset_id: "HYPE",
    decimals: 6,
    chain_id: "solana",
    symbol: "HYPE",
  },
  XRP: {
    asset_id: "XRP",
    decimals: 6,
    chain_id: "unknown",
    symbol: "XRP",
  },
};

const DEFAULT_ASSET_ID: AssetId = "USDC";

/**
 * Get asset metadata by asset ID.
 * Returns USDC metadata if asset_id is not provided or not found.
 * 
 * @param asset_id - Asset ID (defaults to "USDC")
 * @returns Asset metadata
 */
export function getAssetMeta(asset_id?: AssetId): AssetMeta {
  if (!asset_id) {
    return ASSET_REGISTRY[DEFAULT_ASSET_ID];
  }
  
  const meta = ASSET_REGISTRY[asset_id];
  if (!meta) {
    // Fallback to USDC if asset not found
    return ASSET_REGISTRY[DEFAULT_ASSET_ID];
  }
  
  return meta;
}

/**
 * Resolve asset metadata from symbol and optional chain.
 * Returns default USDC metadata if symbol not found or not provided.
 * 
 * @param symbol - Asset symbol (e.g., "USDC", "ETH", "SOL")
 * @param chain - Optional chain identifier (e.g., "ethereum", "solana")
 * @param decimals - Optional decimals override
 * @returns Asset metadata
 */
export function resolveAssetFromSymbol(symbol?: string, chain?: string, decimals?: number): AssetMeta {
  // Default to USDC if no symbol provided
  if (!symbol) {
    return ASSET_REGISTRY[DEFAULT_ASSET_ID];
  }
  
  // Try to find asset by symbol (case-insensitive)
  const symbolUpper = symbol.toUpperCase();
  const assetId = symbolUpper as AssetId;
  
  if (ASSET_REGISTRY[assetId]) {
    const meta = { ...ASSET_REGISTRY[assetId] };
    
    // Override chain if provided
    if (chain) {
      meta.chain_id = chain as ChainId;
    }
    
    // Override decimals if provided
    if (decimals !== undefined) {
      meta.decimals = decimals;
    }
    
    return meta;
  }
  
  // If symbol not found, create a synthetic asset metadata
  // This allows custom assets while maintaining backward compatibility
  const syntheticMeta: AssetMeta = {
    asset_id: DEFAULT_ASSET_ID, // Use USDC as fallback asset_id
    symbol: symbolUpper,
    decimals: decimals ?? 6, // Default to 6 decimals (USDC-like)
    chain_id: (chain as ChainId) || "unknown",
  };
  
  return syntheticMeta;
}

