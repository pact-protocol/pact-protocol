/**
 * Server-side validation for platform_verified (Stripe) anchors.
 * Ensures only non-sensitive identifiers; rejects raw Stripe account/customer IDs.
 */

function hasRawStripeId(obj: unknown): boolean {
  if (obj == null) return false;
  if (typeof obj === "string") {
    const s = obj.trim();
    return s.startsWith("acct_") || s.startsWith("cus_");
  }
  if (Array.isArray(obj)) return obj.some(hasRawStripeId);
  if (typeof obj === "object") {
    return Object.values(obj).some(hasRawStripeId);
  }
  return false;
}

export function validatePlatformVerifiedPayload(
  anchorType: string,
  payload: Record<string, unknown>
): void {
  if (anchorType !== "platform_verified") return;

  if (hasRawStripeId(payload)) {
    throw new Error(
      "platform_verified payload must not contain raw Stripe IDs (acct_*, cus_*). Use account_id_fingerprint: sha256:<hex> instead."
    );
  }

  const platform = payload.platform;
  if (platform !== "stripe") {
    throw new Error(
      `platform_verified requires payload.platform === "stripe", got: ${JSON.stringify(platform)}`
    );
  }

  const accountType = payload.account_type;
  if (accountType !== "merchant" && accountType !== "customer") {
    throw new Error(
      `platform_verified requires payload.account_type ("merchant" | "customer"), got: ${JSON.stringify(accountType)}`
    );
  }

  const fingerprint = payload.account_id_fingerprint;
  if (typeof fingerprint !== "string" || !fingerprint.trim()) {
    throw new Error(
      "platform_verified requires payload.account_id_fingerprint (e.g. sha256:<hex>)"
    );
  }
  if (!/^sha256:[a-f0-9]{64}$/i.test(fingerprint.trim())) {
    throw new Error(
      "payload.account_id_fingerprint must match sha256:<64 hex chars>"
    );
  }
}
