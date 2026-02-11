/**
 * Server-side validation for oidc_verified (enterprise identity binding) anchors.
 * Ensures only non-sensitive identifiers; rejects raw JWTs or SAML assertions.
 */

function hasRawAssertion(obj: unknown): boolean {
  if (obj == null) return false;
  if (typeof obj === "string") {
    const s = obj.trim();
    return s.startsWith("eyJ") || s.toLowerCase().includes("<saml") || s.includes("Bearer ");
  }
  if (Array.isArray(obj)) return obj.some(hasRawAssertion);
  if (typeof obj === "object") {
    return Object.values(obj).some(hasRawAssertion);
  }
  return false;
}

const FINGERPRINT_REGEX = /^sha256:[a-f0-9]{64}$/i;

export function validateOidcPayload(
  anchorType: string,
  payload: Record<string, unknown>
): void {
  if (anchorType !== "oidc_verified") return;

  if (hasRawAssertion(payload)) {
    throw new Error(
      "oidc_verified payload must not contain raw JWTs or SAML assertions. Use assertion_fingerprint: sha256:<hex> instead."
    );
  }

  const issuer = payload.issuer;
  if (typeof issuer !== "string" || !issuer.trim()) {
    throw new Error("oidc_verified requires payload.issuer");
  }

  const subject = payload.subject;
  if (typeof subject !== "string" || !subject.trim()) {
    throw new Error("oidc_verified requires payload.subject");
  }

  const fingerprint = payload.assertion_fingerprint;
  if (typeof fingerprint !== "string" || !fingerprint.trim()) {
    throw new Error(
      "oidc_verified requires payload.assertion_fingerprint (sha256:<64 hex chars>)"
    );
  }
  if (!FINGERPRINT_REGEX.test(fingerprint.trim())) {
    throw new Error(
      "payload.assertion_fingerprint must match sha256:<64 hex chars>"
    );
  }
}
