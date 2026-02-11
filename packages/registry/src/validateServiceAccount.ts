/**
 * Server-side validation for service_account_verified (cloud workload identity) anchors.
 * Ensures only non-sensitive identifiers; rejects raw JWT/SAML/API keys.
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

export function validateServiceAccountPayload(
  anchorType: string,
  payload: Record<string, unknown>
): void {
  if (anchorType !== "service_account_verified") return;

  if (hasRawAssertion(payload)) {
    throw new Error(
      "service_account_verified payload must not contain raw JWTs, SAML, or API keys. Use evidence_fingerprint: sha256:<hex> instead."
    );
  }

  const cloud = payload.cloud;
  if (cloud !== "aws" && cloud !== "gcp" && cloud !== "azure") {
    throw new Error(
      `service_account_verified requires payload.cloud ("aws" | "gcp" | "azure"), got: ${JSON.stringify(cloud)}`
    );
  }

  const serviceAccount = payload.service_account;
  if (typeof serviceAccount !== "string" || !serviceAccount.trim()) {
    throw new Error("service_account_verified requires payload.service_account");
  }

  const attestationType = payload.attestation_type;
  const validAttestationTypes = ["challenge_response", "workload_identity", "metadata_signature"];
  if (
    attestationType != null &&
    typeof attestationType === "string" &&
    !validAttestationTypes.includes(attestationType)
  ) {
    throw new Error(
      `service_account_verified payload.attestation_type must be one of ${validAttestationTypes.join(", ")}, got: ${JSON.stringify(attestationType)}`
    );
  }

  const fingerprint = payload.evidence_fingerprint;
  if (typeof fingerprint !== "string" || !fingerprint.trim()) {
    throw new Error(
      "service_account_verified requires payload.evidence_fingerprint (sha256:<64 hex chars>)"
    );
  }
  if (!FINGERPRINT_REGEX.test(fingerprint.trim())) {
    throw new Error(
      "payload.evidence_fingerprint must match sha256:<64 hex chars>"
    );
  }
}
