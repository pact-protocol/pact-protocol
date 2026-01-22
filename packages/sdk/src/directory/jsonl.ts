import type { ProviderDirectory, ProviderRecord } from "./types";
import { appendFileSync, readFileSync, existsSync } from "node:fs";

export class JsonlProviderDirectory implements ProviderDirectory {
  private providers: Map<string, ProviderRecord[]> = new Map();
  private path: string;

  constructor(opts: { path: string }) {
    this.path = opts.path;
    this.load();
  }

  /**
   * Load providers from JSONL file.
   * Ignores malformed lines and continues.
   * Deduplicates by provider_id, keeping the latest occurrence.
   */
  load(): void {
    if (!existsSync(this.path)) {
      return; // File doesn't exist yet, start with empty directory
    }

    try {
      const content = readFileSync(this.path, "utf8");
      const lines = content.split("\n").filter((line) => line.trim() !== "");

      // Track seen providers by intentType and provider_id to dedupe (keep latest)
      const seen = new Map<string, Map<string, ProviderRecord>>();

      for (const line of lines) {
        try {
          const record: ProviderRecord = JSON.parse(line);
          // Validate required fields
          if (
            record.provider_id &&
            record.intentType &&
            record.pubkey_b58
          ) {
            const key = record.intentType;
            if (!seen.has(key)) {
              seen.set(key, new Map());
            }
            // Store latest occurrence (overwrites previous)
            seen.get(key)!.set(record.provider_id, record);
          }
        } catch (error) {
          // Ignore malformed lines
        }
      }

      // Convert deduplicated maps to arrays (preserving insertion order from file)
      for (const [intentType, providerMap] of seen.entries()) {
        this.providers.set(intentType, Array.from(providerMap.values()));
      }
    } catch (error) {
      // If file read fails, start with empty directory
    }
  }

  /**
   * Register a provider and append to JSONL file.
   */
  registerProvider(record: ProviderRecord): void {
    // Validate required fields
    if (!record.provider_id || !record.intentType || !record.pubkey_b58) {
      throw new Error("Provider record missing required fields");
    }

    // Update in-memory map
    const key = record.intentType;
    const list = this.providers.get(key) || [];
    list.push(record);
    this.providers.set(key, list);

    // Append to JSONL file
    try {
      const line = JSON.stringify(record) + "\n";
      appendFileSync(this.path, line, "utf8");
    } catch (error) {
      // If write fails, at least the in-memory map is updated
      // In production, you might want to throw or log this
    }
  }

  /**
   * List providers for a given intent type in insertion order.
   * Deduplicates by provider_id, keeping the latest occurrence.
   */
  listProviders(intentType: string): ProviderRecord[] {
    const list = this.providers.get(intentType) || [];
    // Dedupe on the fly (in case registerProvider was called without reload)
    const seen = new Map<string, ProviderRecord>();
    for (const record of list) {
      seen.set(record.provider_id, record); // Latest wins
    }
    return Array.from(seen.values());
  }
}


