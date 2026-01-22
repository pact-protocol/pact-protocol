export type ProviderRecord = {
  provider_id: string;
  intentType: string;
  pubkey_b58: string;
  // optional metadata used by router/selection
  region?: string;
  credentials?: string[];
  baseline_latency_ms?: number;
  // optional HTTP endpoint for real providers
  endpoint?: string;
};

export type ProviderDirectory = {
  listProviders(intentType: string): ProviderRecord[];
  registerProvider(record: ProviderRecord): void;
};

