import { describe, it, expect } from "vitest";
import { stableCanonicalize, hashMessage, hashMessageSync } from "../canonical";

describe("stableCanonicalize", () => {
  it("should produce same output for objects with different key orders", () => {
    const obj1 = { b: 2, a: 1, c: 3 };
    const obj2 = { a: 1, b: 2, c: 3 };
    const obj3 = { c: 3, a: 1, b: 2 };

    const canonical1 = stableCanonicalize(obj1);
    const canonical2 = stableCanonicalize(obj2);
    const canonical3 = stableCanonicalize(obj3);

    expect(canonical1).toBe(canonical2);
    expect(canonical2).toBe(canonical3);
  });

  it("should preserve array order", () => {
    const obj1 = { items: [1, 2, 3] };
    const obj2 = { items: [3, 2, 1] };

    const canonical1 = stableCanonicalize(obj1);
    const canonical2 = stableCanonicalize(obj2);

    expect(canonical1).not.toBe(canonical2);
  });

  it("should handle nested objects", () => {
    const obj1 = { a: { z: 1, y: 2 }, b: 3 };
    const obj2 = { b: 3, a: { y: 2, z: 1 } };

    const canonical1 = stableCanonicalize(obj1);
    const canonical2 = stableCanonicalize(obj2);

    expect(canonical1).toBe(canonical2);
  });

  it("should handle primitives", () => {
    expect(stableCanonicalize(null)).toBe("null");
    expect(stableCanonicalize(42)).toBe("42");
    expect(stableCanonicalize("hello")).toBe('"hello"');
    expect(stableCanonicalize(true)).toBe("true");
  });

  it("should handle arrays", () => {
    const arr = [1, 2, 3];
    const canonical = stableCanonicalize(arr);
    expect(canonical).toBe("[1,2,3]");
  });
});

describe("hashMessage", () => {
  it("should produce same hash for objects with different key orders", async () => {
    const obj1 = { b: 2, a: 1, c: 3 };
    const obj2 = { a: 1, b: 2, c: 3 };

    const hash1 = await hashMessage(obj1);
    const hash2 = await hashMessage(obj2);

    expect(Array.from(hash1)).toEqual(Array.from(hash2));
  });

  it("should produce different hashes for different values", async () => {
    const obj1 = { a: 1 };
    const obj2 = { a: 2 };

    const hash1 = await hashMessage(obj1);
    const hash2 = await hashMessage(obj2);

    expect(Array.from(hash1)).not.toEqual(Array.from(hash2));
  });

  it("should produce 32-byte (256-bit) hashes", async () => {
    const obj = { test: "data" };
    const hash = await hashMessage(obj);
    expect(hash.length).toBe(32);
  });
});

describe("hashMessageSync", () => {
  it("should produce same hash as async version", () => {
    const obj = { a: 1, b: 2, c: 3 };
    const hashSync = hashMessageSync(obj);

    return hashMessage(obj).then((hashAsync) => {
      expect(Array.from(hashSync)).toEqual(Array.from(hashAsync));
    });
  });
});

