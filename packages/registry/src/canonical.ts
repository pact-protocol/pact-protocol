/**
 * Stable canonical JSON for anchor_id and signature payload.
 */

export function stableCanonicalize(obj: unknown): string {
  if (obj === null || obj === undefined) return JSON.stringify(obj);
  if (typeof obj === "string" || typeof obj === "number" || typeof obj === "boolean")
    return JSON.stringify(obj);
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
