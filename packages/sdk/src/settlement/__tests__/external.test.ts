/**
 * ExternalSettlementProvider Tests
 * 
 * Tests that ExternalSettlementProvider throws NotImplemented errors cleanly.
 */

import { describe, it, expect } from "vitest";
import { ExternalSettlementProvider } from "../external";

describe("ExternalSettlementProvider", () => {
  const provider = new ExternalSettlementProvider({
    rail: "stripe",
    network: "sandbox",
  });

  it("returns 0 for getBalance (read-only consistency)", () => {
    expect(provider.getBalance("agent1")).toBe(0);
  });

  it("returns 0 for getLocked (read-only consistency)", () => {
    expect(provider.getLocked("agent1")).toBe(0);
  });

  it("throws NotImplemented for lock", () => {
    expect(() => provider.lock("agent1", 0.1)).toThrow("ExternalSettlementProvider: NotImplemented");
  });

  it("throws NotImplemented for release", () => {
    expect(() => provider.release("agent1", 0.1)).toThrow("ExternalSettlementProvider: NotImplemented");
  });

  it("throws NotImplemented for pay", () => {
    expect(() => provider.pay("buyer", "seller", 0.1)).toThrow("ExternalSettlementProvider: NotImplemented");
  });

  it("throws NotImplemented for pay with meta", () => {
    expect(() => provider.pay("buyer", "seller", 0.1, { intent_id: "test" })).toThrow("ExternalSettlementProvider: NotImplemented");
  });

  it("throws NotImplemented for slashBond", () => {
    expect(() => provider.slashBond("provider", 0.1, "beneficiary")).toThrow("ExternalSettlementProvider: NotImplemented");
  });

  it("throws NotImplemented for slashBond with meta", () => {
    expect(() => provider.slashBond("provider", 0.1, "beneficiary", { failure_code: "FAILED_PROOF" })).toThrow("ExternalSettlementProvider: NotImplemented");
  });

  it("throws NotImplemented for legacy credit", () => {
    expect(() => provider.credit("agent1", 0.1)).toThrow("NotImplemented: credit()");
  });

  it("throws NotImplemented for legacy debit", () => {
    expect(() => provider.debit("agent1", 0.1)).toThrow("NotImplemented: debit()");
  });

  it("returns false for legacy lockFunds when lock throws", () => {
    expect(provider.lockFunds("agent1", 0.1)).toBe(false);
  });

  it("returns false for legacy lockBond when lock throws", () => {
    expect(provider.lockBond("agent1", 0.1)).toBe(false);
  });

  it("throws NotImplemented for legacy unlock (delegates to release)", () => {
    expect(() => provider.unlock("agent1", 0.1)).toThrow("ExternalSettlementProvider: NotImplemented");
  });

  it("throws NotImplemented for legacy releaseFunds (delegates to credit)", () => {
    expect(() => provider.releaseFunds("agent1", 0.1)).toThrow("ExternalSettlementProvider: NotImplemented");
  });

  it("throws NotImplemented for legacy slash (delegates to slashBond)", () => {
    expect(() => provider.slash("provider", "beneficiary", 0.1)).toThrow("ExternalSettlementProvider: NotImplemented");
  });

  it("returns false for streamTick when pay throws", () => {
    expect(provider.streamTick("buyer", "seller", 0.1)).toBe(false);
  });
});

