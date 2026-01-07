/**
 * Receipt Store
 * 
 * In-memory store for receipts with optional JSONL persistence.
 */

import { readFileSync, existsSync, appendFileSync } from "node:fs";

export class ReceiptStore {
  private receipts: any[] = [];
  private jsonlPath?: string;

  constructor(opts?: { jsonlPath?: string }) {
    this.jsonlPath = opts?.jsonlPath;
  }

  /**
   * Ingest a receipt into the store.
   * If jsonlPath is set, append to file as JSON line.
   */
  ingest(receipt: any): void {
    this.receipts.push(receipt);
    
    if (this.jsonlPath) {
      try {
        const line = JSON.stringify(receipt) + "\n";
        appendFileSync(this.jsonlPath, line, "utf8");
      } catch (err) {
        // Ignore write errors in demo/test contexts
      }
    }
  }

  /**
   * List receipts with optional filters.
   */
  list(opts?: { limit?: number; intentType?: string; agentId?: string }): any[] {
    let filtered = [...this.receipts];

    if (opts?.intentType) {
      filtered = filtered.filter((r) => (r as any).intent_type === opts.intentType);
    }

    if (opts?.agentId) {
      filtered = filtered.filter(
        (r) => r.buyer_agent_id === opts.agentId || r.seller_agent_id === opts.agentId
      );
    }

    if (opts?.limit) {
      filtered = filtered.slice(-opts.limit);
    }

    return filtered;
  }

  /**
   * Load receipts from JSONL file if it exists.
   * Ignores malformed lines.
   */
  loadFromJsonl(): void {
    if (!this.jsonlPath || !existsSync(this.jsonlPath)) {
      return;
    }

    try {
      const content = readFileSync(this.jsonlPath, "utf8");
      const lines = content.trim().split("\n").filter((line) => line.trim());
      
      for (const line of lines) {
        try {
          const receipt = JSON.parse(line);
          this.receipts.push(receipt);
        } catch {
          // Ignore malformed lines
        }
      }
    } catch (err) {
      // Ignore read errors (file might not exist yet)
    }
  }
}

