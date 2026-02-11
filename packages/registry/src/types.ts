/**
 * Anchor attestation and registry types.
 */

export const ANCHOR_TYPES = [
  "kyb_verified",
  "credential_verified",
  "platform_verified",
  "service_account_verified",
  "domain_verified",
  "oidc_verified",
] as const;

export type AnchorType = (typeof ANCHOR_TYPES)[number];

export interface AnchorAttestation {
  anchor_id: string;
  subject_signer_public_key_b58: string;
  anchor_type: AnchorType | string;
  issuer_public_key_b58: string;
  issued_at_ms: number;
  payload: Record<string, unknown>;
  signature_b58: string;
  scheme: "ed25519";
  display_name?: string;
  verification_method?: string;
  expires_at_ms?: number | null;
  revocation_ref?: string | null;
  evidence_refs?: string[] | null;
}

export interface IssueRequest {
  subject_signer_public_key_b58: string;
  anchor_type: string;
  payload: Record<string, unknown>;
  display_name?: string;
  verification_method?: string;
  expires_at_ms?: number | null;
  evidence_refs?: string[] | null;
}

export interface RevokeRequest {
  anchor_id: string;
  reason?: string;
  revoked_at_ms?: number;
}

export interface RevocationRecord {
  anchor_id: string;
  revoked_at_ms: number;
  reason?: string;
}

export interface TrustedIssuer {
  issuer_public_key_b58: string;
  name: string;
  scopes?: string[];
}

export interface TrustedIssuersConfig {
  issuers: TrustedIssuer[];
}
