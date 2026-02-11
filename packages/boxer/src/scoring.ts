/**
 * Minimal scoring: map confidence to reliability_score 0-100 for display.
 */

export function confidenceToReliability(conf: number): number {
  if (typeof conf !== "number" || conf < 0 || conf > 1) return 50;
  return Math.round(conf * 100);
}
