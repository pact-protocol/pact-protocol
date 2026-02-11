/**
 * Paths to canonical packs for golden tests.
 * Packs are read from apps/evidence-viewer/public/packs/ (or design_partner_bundle/packs) at test time.
 * CI: ensure packs exist in public/packs (e.g. copy from design_partner_bundle or commit fixtures).
 */

import { existsSync } from 'fs';
import { join } from 'path';

const FROM_TEST_DIR = join(__dirname, '../../public/packs');
const FROM_ROOT = join(__dirname, '../../../../../design_partner_bundle/packs');

export const PACK_NAMES = {
  success: 'auditor_pack_success.zip',
  abort101: 'auditor_pack_101.zip',
  timeout420: 'auditor_pack_420.zip',
  tamper: 'auditor_pack_semantic_tampered.zip',
} as const;

function resolvePackPath(name: string): string {
  const inPublic = join(FROM_TEST_DIR, name);
  if (existsSync(inPublic)) return inPublic;
  const inBundle = join(FROM_ROOT, name);
  if (existsSync(inBundle)) return inBundle;
  return inPublic; // fallback for exists check
}

export function getPackPath(name: keyof typeof PACK_NAMES): string {
  return resolvePackPath(PACK_NAMES[name]);
}

export function packExists(name: keyof typeof PACK_NAMES): boolean {
  return existsSync(resolvePackPath(PACK_NAMES[name]));
}

export const GOLDEN_EXPECTATIONS = {
  success: { state: 'TRUSTED_COMPLETED' as const, integrityLabel: 'VERIFIED', outcomeLabel: 'COMPLETED' },
  abort101: { state: 'TRUSTED_ABORTED' as const, integrityLabel: 'VERIFIED', outcomeLabel: 'ABORTED' },
  timeout420: { state: 'TRUSTED_TIMEOUT' as const, integrityLabel: 'VERIFIED', outcomeLabel: 'TIMEOUT' },
  tamper: { state: 'UNTRUSTED_TAMPERED' as const, integrityLabel: 'TAMPERED', outcomeLabel: 'UNTRUSTED' },
  invalid: { state: 'UNTRUSTED_INVALID' as const, integrityLabel: 'INVALID', outcomeLabel: 'UNTRUSTED' },
} as const;
