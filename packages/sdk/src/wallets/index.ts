/**
 * Wallets Module
 * 
 * Provides chain-agnostic wallet adapter interface for future integrations with
 * MetaMask, Coinbase Wallet, Solana wallets, and other wallet providers.
 */

// Shared wallet types
export * from "./types";
export type { AddressInfo } from "./ethers";
export type { WalletCapabilities } from "./types";

// EthersWallet (EVM)
export { EthersWalletAdapter as EthersWallet, WALLET_CONNECT_FAILED, WALLET_SIGN_FAILED, ETHERS_WALLET_KIND, EVM_CHAIN } from "./ethers";
export type { EthersWalletOptions } from "./ethers";

// SolanaWallet
export { SolanaWalletAdapter as SolanaWallet, SOLANA_WALLET_KIND, SOLANA_CHAIN } from "./solana";
export type { SolanaWalletOptions } from "./solana";

