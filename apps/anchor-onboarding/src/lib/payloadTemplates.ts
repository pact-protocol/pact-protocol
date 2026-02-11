/**
 * Payload templates by anchor_type for Issue anchor form.
 * Used to pre-fill the payload editor; user can edit raw JSON.
 */

export const ANCHOR_TYPES = [
  'kyb_verified',
  'credential_verified',
  'platform_verified',
  'service_account_verified',
  'oidc_verified',
  'domain_verified',
] as const;

export const VERIFICATION_METHODS = [
  'kyb',
  'credential',
  'stripe',
  'service_account',
  'oidc',
  'domain',
  'api_key',
] as const;

export function getPayloadTemplate(anchorType: string): object {
  switch (anchorType) {
    case 'kyb_verified':
      return { entity_name: '', jurisdiction: '', evidence_fingerprint: 'sha256:<hex>' };
    case 'credential_verified':
      return { credential_type: '', issuer: '', evidence_fingerprint: 'sha256:<hex>' };
    case 'platform_verified':
      return {
        platform: 'stripe',
        account_type: 'merchant',
        account_id_fingerprint: 'sha256:<hex>',
        scope: ['payments'],
        region: 'US',
      };
    case 'service_account_verified':
      return {
        cloud: 'gcp',
        service_account: '',
        attestation_type: 'workload_identity',
        evidence_fingerprint: 'sha256:<hex>',
        scope: ['signing'],
      };
    case 'oidc_verified':
      return {
        issuer: 'https://issuer.example.com',
        subject: '',
        assertion_fingerprint: 'sha256:<hex>',
        scope: ['procurement'],
      };
    case 'domain_verified':
      return { domain: '', evidence_fingerprint: 'sha256:<hex>' };
    default:
      return {};
  }
}

export interface ParseResult {
  ok: true;
  value: object;
}
export interface ParseError {
  ok: false;
  error: string;
}

export function parsePayloadJson(str: string): ParseResult | ParseError {
  const trimmed = str.trim();
  if (!trimmed) return { ok: true, value: {} };
  try {
    const value = JSON.parse(trimmed);
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return { ok: true, value };
    }
    return { ok: false, error: 'Payload must be a JSON object' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON' };
  }
}
