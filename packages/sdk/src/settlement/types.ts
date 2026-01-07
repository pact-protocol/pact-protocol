export interface SettlementAccount {
  agent_id: string;
  balance: number;
  locked: number;
}

export interface Escrow {
  id: string;
  buyer: string;
  seller: string;
  amount: number;
  bond: number;
}

