import type { ProviderDirectory, ProviderRecord } from "./types";

export class InMemoryProviderDirectory implements ProviderDirectory {
  private providers: Map<string, ProviderRecord[]> = new Map();

  registerProvider(record: ProviderRecord): void {
    const key = record.intentType;
    const list = this.providers.get(key) || [];
    list.push(record);
    this.providers.set(key, list);
  }

  listProviders(intentType: string): ProviderRecord[] {
    return this.providers.get(intentType) || [];
  }
}



