/**
 * Negotiation Module
 * 
 * Provides negotiation strategies for price agreement between buyer and provider.
 */

export * from "./types";
export * from "./strategy";
export { BaselineNegotiationStrategy } from "./baseline";
export { BandedConcessionStrategy } from "./banded_concession";
export type { BandedConcessionResult } from "./banded_concession";
export { AggressiveIfUrgentStrategy } from "./aggressive_if_urgent";
export { MLNegotiationStrategy, type MLStrategyParams } from "./ml_strategy";
export * from "./ml";
export { transcriptToTrainingRow, type TrainingRow } from "./training";

