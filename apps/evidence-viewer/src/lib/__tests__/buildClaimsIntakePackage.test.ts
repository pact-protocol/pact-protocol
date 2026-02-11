/**
 * Claims Intake Package: required root files and determinism.
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { buildClaimsIntakePackage } from '../buildClaimsIntakePackage';
import { mockPackTrustedCompleted } from '../../components/__tests__/summaryPanelPackMocks';

const REQUIRED_ROOT_FILES = [
  'auditor_pack.zip',
  'README.txt',
  'checksums.sha256',
  'verify_command.txt',
  'claims_context.json',
  'viewer_version.json',
];

/** Minimal bytes for tests (embedding the "original" pack). */
function testAuditorPackBytes(): ArrayBuffer {
  return new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer; // ZIP magic
}

async function loadZipFromBlob(blob: Blob): Promise<JSZip> {
  const buf = await blob.arrayBuffer();
  return JSZip.loadAsync(buf);
}

function buildInput(overrides: Partial<{ claimType: string; generatedAt: string; auditorPackOriginalFilename: string }> = {}) {
  return {
    packData: mockPackTrustedCompleted(),
    auditorPackBytes: testAuditorPackBytes(),
    auditorPackOriginalFilename: 'auditor_pack_success.zip',
    attachments: [] as { file: File; addedAt: number }[],
    claimType: 'audit',
    generatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildClaimsIntakePackage', () => {
  it('produces ZIP with required root files including auditor_pack.zip', async () => {
    const blob = await buildClaimsIntakePackage(buildInput());
    const zip = await loadZipFromBlob(blob);
    const names = Object.keys(zip.files).filter((n) => !n.endsWith('/'));

    for (const name of REQUIRED_ROOT_FILES) {
      expect(names).toContain(name);
    }
    expect(names).toContain('attachments/.keep');
    expect(names).toContain('transcript.json');
    expect(names).toContain('judgment.json');
    expect(names).toContain('integrity_report.json');
    expect(names).toContain('manifest.json');
    expect(names).toContain('CONSTITUTION_v1.md');
  });

  it('README.txt explains package, auditor_pack.zip, and attachments', async () => {
    const blob = await buildClaimsIntakePackage(buildInput());
    const zip = await loadZipFromBlob(blob);
    const readme = await zip.file('README.txt')?.async('string');
    expect(readme).toContain('Claims Intake Package');
    expect(readme).toContain('auditor_pack.zip');
    expect(readme).toContain('source-of-truth');
    expect(readme).toContain('Attachments are supplemental and not part of original evidence');
    expect(readme).toContain('pact-verifier auditor-pack-verify');
    expect(readme).toContain('checksums.sha256');
  });

  it('checksums.sha256 includes auditor_pack.zip and excludes itself', async () => {
    const blob = await buildClaimsIntakePackage(buildInput());
    const zip = await loadZipFromBlob(blob);
    const checksums = await zip.file('checksums.sha256')?.async('string');
    expect(checksums).toBeDefined();
    expect(checksums).toContain('auditor_pack.zip');
    expect(checksums!.trim().split('\n').some((l) => l.endsWith('  checksums.sha256'))).toBe(false);
    const lines = checksums!.trim().split('\n');
    expect(lines.length).toBeGreaterThan(5);
    for (const line of lines) {
      expect(line).toMatch(/^[a-f0-9]{64}  .+$/);
    }
  });

  it('verify_command.txt verifies embedded auditor_pack.zip', async () => {
    const blob = await buildClaimsIntakePackage(buildInput());
    const zip = await loadZipFromBlob(blob);
    const verify = await zip.file('verify_command.txt')?.async('string');
    expect(verify).toContain('pact-verifier auditor-pack-verify --zip auditor_pack.zip');
    expect(verify).toContain('test-transcript-id');
    expect(verify).toContain('Extract this Claims Intake Package');
  });

  it('claims_context.json has transcript_id, integrity_verdict, claim_type, claims_intent, auditor_pack_sha256, auditor_pack_filename', async () => {
    const blob = await buildClaimsIntakePackage(
      buildInput({ claimType: 'insurance', auditorPackOriginalFilename: 'auditor_pack_success.zip' })
    );
    const zip = await loadZipFromBlob(blob);
    const ctxStr = await zip.file('claims_context.json')?.async('string');
    const ctx = JSON.parse(ctxStr!);
    expect(ctx.transcript_id).toBe('test-transcript-id');
    expect(ctx.integrity_verdict).toBe('VERIFIED');
    expect(ctx.claim_type).toBe('insurance');
    expect(['informational', 'audit', 'regulatory', 'dispute']).toContain(ctx.claims_intent);
    expect(ctx.claims_intent).toBe('dispute'); // unknown/legacy claim_type maps to dispute
    expect(ctx.generated_at).toBe('2025-01-01T00:00:00.000Z');
    expect(ctx.auditor_pack_sha256).toBeDefined();
    expect(typeof ctx.auditor_pack_sha256).toBe('string');
    expect(ctx.auditor_pack_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(ctx.auditor_pack_filename).toBe('auditor_pack_success.zip');
  });

  it('claims_context.json claims_intent maps from claim_type for triage', async () => {
    const intents: Record<string, string> = {};
    for (const claimType of ['informational', 'audit', 'regulatory', 'policy_appeal', 'payment_dispute', 'breach', 'other']) {
      const blob = await buildClaimsIntakePackage(buildInput({ claimType }));
      const zip = await loadZipFromBlob(blob);
      const ctx = JSON.parse((await zip.file('claims_context.json')?.async('string'))!);
      intents[claimType] = ctx.claims_intent;
    }
    expect(intents.informational).toBe('informational');
    expect(intents.audit).toBe('audit');
    expect(intents.regulatory).toBe('regulatory');
    expect(intents.policy_appeal).toBe('dispute');
    expect(intents.payment_dispute).toBe('dispute');
    expect(intents.breach).toBe('dispute');
    expect(intents.other).toBe('dispute');
  });

  it('viewer_version.json has evidence_viewer_version, pact_verifier_version, constitution_hash', async () => {
    const blob = await buildClaimsIntakePackage(buildInput());
    const zip = await loadZipFromBlob(blob);
    const vStr = await zip.file('viewer_version.json')?.async('string');
    const v = JSON.parse(vStr!);
    expect(v.evidence_viewer_version).toBe('0.1.0');
    expect(v.pact_verifier_version).toBeDefined();
    expect(v.constitution_hash).toBeDefined();
  });

  it('includes attachments/ with files when attachments provided', async () => {
    const blob = await buildClaimsIntakePackage({
      ...buildInput(),
      attachments: [
        { file: new File(['test'], 'note.txt', { type: 'text/plain' }), addedAt: Date.now() },
      ],
    });
    const zip = await loadZipFromBlob(blob);
    const names = Object.keys(zip.files);
    expect(names.some((n) => n.startsWith('attachments/') && n !== 'attachments/.keep')).toBe(true);
    expect(names).toContain('attachments_manifest.json');
  });
});
