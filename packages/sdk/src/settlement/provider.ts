export interface SettlementProvider {
  getBalance(agentId: string): number;
  credit(agentId: string, amount: number): void;
  debit(agentId: string, amount: number): void;

  lockFunds(agentId: string, amount: number): boolean;
  lockBond(agentId: string, amount: number): boolean;
  unlock(agentId: string, amount: number): void;

  releaseFunds(toAgentId: string, amount: number): void;
  slash(fromAgentId: string, toAgentId: string, amount: number): void;

  streamTick(buyerId: string, sellerId: string, amount: number): boolean;
}




