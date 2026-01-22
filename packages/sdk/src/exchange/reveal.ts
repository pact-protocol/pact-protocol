import { verifyReveal } from "./commit";

export { verifyReveal } from "./commit";

/**
 * Verify reveal message matches commit hash.
 */
export function verifyRevealMessage(
  commitHashHex: string,
  payloadB64: string,
  nonceB64: string
): boolean {
  return verifyReveal(commitHashHex, payloadB64, nonceB64);
}

