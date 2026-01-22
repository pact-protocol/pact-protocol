/**
 * Canonical JSON serialization for deterministic hashing.
 * Sorts object keys recursively while preserving array order.
 */
export function stableCanonicalize(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return JSON.stringify(obj);
  }

  if (typeof obj === "string" || typeof obj === "number" || typeof obj === "boolean") {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    const items = obj.map((item) => stableCanonicalize(item));
    return `[${items.join(",")}]`;
  }

  if (typeof obj === "object") {
    const keys = Object.keys(obj).sort();
    const pairs = keys.map((key) => {
      const value = (obj as Record<string, unknown>)[key];
      return `${JSON.stringify(key)}:${stableCanonicalize(value)}`;
    });
    return `{${pairs.join(",")}}`;
  }

  return JSON.stringify(obj);
}

/**
 * Compute SHA-256 hash of canonical JSON representation.
 */
export async function hashMessage(obj: unknown): Promise<Uint8Array> {
  const canonical = stableCanonicalize(obj);
  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hashBuffer);
}

/**
 * Synchronous version using Node.js crypto (for testing/compatibility).
 * Falls back to async version if crypto.subtle is not available.
 */
export function hashMessageSync(obj: unknown): Uint8Array {
  const canonical = stableCanonicalize(obj);
  // For Node.js environments, we can use the crypto module
  // In browser environments, this will need to use the async version
  if (typeof process !== "undefined" && process.versions?.node) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require("crypto");
    const hash = crypto.createHash("sha256");
    hash.update(canonical, "utf8");
    return new Uint8Array(hash.digest());
  }
  // Fallback: this should not be called in sync context without Node.js crypto
  throw new Error("hashMessageSync requires Node.js crypto module");
}

