import type { SettlementProvider } from "./provider";

type Account = { balance: number; locked: number };

export class MockSettlementProvider implements SettlementProvider {
  private accounts = new Map<string, Account>();

  private acct(agentId: string): Account {
    const a = this.accounts.get(agentId);
    if (a) return a;
    const created = { balance: 0, locked: 0 };
    this.accounts.set(agentId, created);
    return created;
  }

  // --- test helpers ---
  setBalance(agentId: string, balance: number): void {
    if (!Number.isFinite(balance) || balance < 0) throw new Error("balance must be >= 0");
    const a = this.acct(agentId);
    // balance represents available balance
    a.balance = balance;
    // locked can be independent of available balance
  }

  getAccount(agentId: string): { balance: number; locked: number } {
    const a = this.acct(agentId);
    return { balance: a.balance, locked: a.locked };
  }

  // --- core interface ---
  getBalance(agentId: string): number {
    return this.acct(agentId).balance;
  }

  getLocked(agentId: string): number {
    return this.acct(agentId).locked;
  }

  credit(agentId: string, amount: number): void {
    if (!(amount >= 0)) throw new Error("amount must be >= 0");
    // balance represents available balance
    this.acct(agentId).balance += amount;
  }

  debit(agentId: string, amount: number): void {
    if (!(amount >= 0)) throw new Error("amount must be >= 0");
    const a = this.acct(agentId);
    // balance represents available balance
    if (a.balance < amount) throw new Error("insufficient available balance");
    a.balance -= amount;
  }

  lockFunds(agentId: string, amount: number): boolean {
    if (!(amount >= 0)) return false;
    const a = this.acct(agentId);
    // balance represents available balance
    if (a.balance < amount) return false;
    a.balance -= amount; // decrease available
    a.locked += amount;  // increase locked
    return true;
  }

  lockBond(agentId: string, amount: number): boolean {
    return this.lockFunds(agentId, amount);
  }

  unlock(agentId: string, amount: number): void {
    if (!(amount >= 0)) throw new Error("amount must be >= 0");
    const a = this.acct(agentId);
    const unlockAmount = Math.min(amount, a.locked);
    a.locked -= unlockAmount; // decrease locked
    a.balance += unlockAmount; // increase available
  }

  releaseFunds(toAgentId: string, amount: number): void {
    if (!(amount >= 0)) throw new Error("amount must be >= 0");
    // balance represents available balance
    this.acct(toAgentId).balance += amount;
  }

  slash(fromAgentId: string, toAgentId: string, amount: number): void {
    if (!(amount >= 0)) throw new Error("amount must be >= 0");
    const from = this.acct(fromAgentId);
    const totalAvailable = from.balance + from.locked;
    if (totalAvailable < amount) throw new Error("insufficient balance to slash");
    
    // Remove from locked first (if possible), otherwise from balance
    const fromLocked = Math.min(amount, from.locked);
    const fromBalance = amount - fromLocked;
    
    from.locked -= fromLocked;
    from.balance -= fromBalance;
    
    // Credit to available balance
    this.acct(toAgentId).balance += amount;
  }

  /**
   * Streaming tick: pay-as-you-go from buyer AVAILABLE balance
   * balance already represents available, no need to subtract locked
   */
  streamTick(buyerId: string, sellerId: string, amount: number): boolean {
    if (!(amount > 0)) return false;
    const buyer = this.acct(buyerId);
    const seller = this.acct(sellerId);
    // balance represents available balance
    if (buyer.balance < amount) return false;
    buyer.balance -= amount;
    seller.balance += amount;
    return true;
  }
}

