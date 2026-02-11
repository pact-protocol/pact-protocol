/**
 * Build an auditor-grade, reproducible Claims Intake Package ZIP.
 * Deterministic file order and canonical JSON so third parties can verify contents.
 */

import JSZip from 'jszip';
import type { AuditorPackData } from '../types';
import { getIntegrityVerdict } from './integrityVerdict';
import {
  getTranscriptId,
  getStatus,
  getJudgment,
  getTimestamp,
  getTransactionPurpose,
  getTransactionHash,
  getBuyerPubkey,
  getProviderOfRecordPubkey,
} from './summaryExtract';
import { getDisplayOutcomeLabel } from './badgeSemantics';
import type { AttachmentEntry } from '../components/AttachmentsDropZone';

const EVIDENCE_VIEWER_VERSION = '0.1.0';
const PACT_VERIFIER_VERSION = '0.2.1';

async function sha256Hex(data: ArrayBuffer | string): Promise<string> {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data).buffer : data;
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Recursively sort object keys for deterministic JSON. Arrays keep order. */
function canonicalize(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(canonicalize);
  return Object.keys(obj as Record<string, unknown>)
    .sort()
    .reduce((acc: Record<string, unknown>, k) => {
      acc[k] = canonicalize((obj as Record<string, unknown>)[k]);
      return acc;
    }, {});
}

function canonicalJson(obj: unknown): string {
  return JSON.stringify(canonicalize(obj), null, 2);
}

export interface BuildClaimsPackageInput {
  packData: AuditorPackData;
  /** Exact bytes of the loaded auditor pack (no recompression). */
  auditorPackBytes: ArrayBuffer;
  /** Original filename when loaded (e.g. auditor_pack_success.zip or user file name). */
  auditorPackOriginalFilename?: string;
  attachments: AttachmentEntry[];
  claimType: string;
  generatedAt: string;
}

/**
 * Build README.txt at zip root.
 */
function buildReadmeTxt(
  transcriptId: string,
  integrityVerdict: string,
  verifyCommand: string
): string {
  return `Claims Intake Package
========================

This package contains verified evidence and optional supplemental materials for insurers, arbitrators, or internal review. It is produced by the Pact Evidence Viewer and is intended for audit and claims workflows.

Integrity verdict: ${integrityVerdict}
Transcript ID: ${transcriptId}

AUDITOR PACK (SOURCE OF TRUTH)
------------------------------
The included auditor_pack.zip is the exact original evidence bundle. Verify it independently using the pact-verifier CLI. See verify_command.txt for the copy/paste command.

INCLUDED ARTIFACTS
-----------------
- auditor_pack.zip          Original auditor pack (source-of-truth evidence). Verify with verifier CLI.
- transcript.json          Transcript of the negotiation (immutable evidence).
- judgment.json            Blame/judgment output from verifier.
- gc_view.json             GC view (executive summary, responsibility, integrity).
- manifest.json            Pack manifest (transcript_id, constitution, timestamps).
- CONSTITUTION_v1.md       Constitution rules applied.
- integrity_report.json    Integrity verdict and subcheck details.
- verification_summary.json Verdict, transcript_id, created_at.
- claims_context.json      Claims context (transcript_id, outcome, responsibility, claim_type, etc.).
- viewer_version.json      Evidence-viewer version, verifier version, constitution_hash.
- verify_command.txt       CLI command to verify auditor_pack.zip (extract this package first).
- checksums.sha256         SHA256 of each file in this package (excluding this file).
- attachments/             Supplemental materials (if any). Not part of original evidence.

Attachments are supplemental and not part of original evidence. They are included only in this Claims Intake Package.

TO VERIFY THE EVIDENCE
----------------------
Extract this claims package, then run the command in verify_command.txt to verify auditor_pack.zip.

${verifyCommand}
`;
}

/**
 * Build verify_command.txt. Verifies the embedded auditor_pack.zip.
 */
function buildVerifyCommandTxt(transcriptId: string): string {
  const cmd = 'pact-verifier auditor-pack-verify --zip auditor_pack.zip';
  return `Extract this Claims Intake Package, then from the directory containing the extracted files run:

${cmd}

This verifies the embedded auditor_pack.zip (the source-of-truth evidence bundle).

Transcript ID (for correlation): ${transcriptId}
`;
}

/** Map claim_type (UI value) to claims_intent for insurer/arbitrator triage. */
export type ClaimsIntent = 'informational' | 'audit' | 'regulatory' | 'dispute';

function claimTypeToClaimsIntent(claimType: string): ClaimsIntent | undefined {
  const v = (claimType ?? '').toLowerCase().trim();
  if (v === 'informational') return 'informational';
  if (v === 'audit') return 'audit';
  if (v === 'regulatory') return 'regulatory';
  if (v === 'policy_appeal' || v === 'payment_dispute' || v === 'breach' || v === 'other') return 'dispute';
  if (v) return 'dispute'; // any other selected type
  return undefined;
}

/**
 * Build claims_context.json matching the UI Claims Context panel.
 * Includes claims_intent for insurer/arbitrator triage automation.
 */
function buildClaimsContextJson(
  packData: AuditorPackData,
  claimType: string,
  generatedAt: string,
  auditorPackSha256: string,
  auditorPackOriginalFilename?: string
): Record<string, unknown> {
  const verdict = getIntegrityVerdict(packData);
  const isTrusted = verdict.verdict === 'VERIFIED';
  const transcriptId = getTranscriptId(packData);
  const txHash = getTransactionHash(packData);
  const timestamp = getTimestamp(packData);
  const purpose = getTransactionPurpose(packData);
  const buyerPk = getBuyerPubkey(packData);
  const providerPk = getProviderOfRecordPubkey(packData);
  const rawStatus = getStatus(packData.gcView);
  const displayOutcome = getDisplayOutcomeLabel(verdict.verdict, rawStatus);
  const responsibility = isTrusted ? (getJudgment(packData.judgment, packData.gcView) || null) : null;

  return {
    transcript_id: transcriptId || undefined,
    transaction_hash: txHash.hash || undefined,
    timestamp: timestamp || undefined,
    purpose: purpose || undefined,
    buyer_pubkey: buyerPk ?? undefined,
    provider_pubkey: providerPk ?? undefined,
    integrity_verdict: verdict.verdict,
    outcome: isTrusted ? displayOutcome : undefined,
    responsibility: isTrusted ? responsibility : undefined,
    claim_type: claimType || undefined,
    claims_intent: claimTypeToClaimsIntent(claimType),
    generated_at: generatedAt,
    auditor_pack_sha256: auditorPackSha256,
    auditor_pack_filename: auditorPackOriginalFilename ?? undefined,
  };
}

/**
 * Build viewer_version.json.
 */
function buildViewerVersionJson(packData: AuditorPackData): Record<string, unknown> {
  const constitutionHash =
    packData.manifest?.constitution_hash ??
    (packData.gcView as { constitution?: { hash?: string } })?.constitution?.hash ??
    undefined;
  return {
    evidence_viewer_version: EVIDENCE_VIEWER_VERSION,
    pact_verifier_version: PACT_VERIFIER_VERSION,
    boxer_version: null,
    constitution_hash: constitutionHash ?? undefined,
  };
}

export async function buildClaimsIntakePackage(input: BuildClaimsPackageInput): Promise<Blob> {
  const { packData, auditorPackBytes, auditorPackOriginalFilename, attachments, claimType, generatedAt } = input;
  const verdict = getIntegrityVerdict(packData);
  const transcriptId = getTranscriptId(packData);
  const verifyCommand = buildVerifyCommandTxt(transcriptId);
  const verifyCommandOneLine = 'pact-verifier auditor-pack-verify --zip auditor_pack.zip';

  type Entry = { path: string; content: string | Uint8Array };
  const entries: Entry[] = [];

  // —— Embedded original auditor pack (exact bytes, no recompression) ——
  const auditorPackSha256 = await sha256Hex(auditorPackBytes);
  entries.push({ path: 'auditor_pack.zip', content: new Uint8Array(auditorPackBytes) });

  // —— Immutable evidence (canonical JSON where applicable) ——
  const transcriptJson = packData.transcript ?? '{}';
  entries.push({ path: 'transcript.json', content: transcriptJson });

  entries.push({
    path: 'judgment.json',
    content: canonicalJson(packData.judgment),
  });
  entries.push({
    path: 'integrity_report.json',
    content: canonicalJson({
      verdict: verdict.verdict,
      color: verdict.color,
      details: verdict.details,
    }),
  });
  entries.push({
    path: 'verification_summary.json',
    content: canonicalJson({
      verdict: verdict.verdict,
      transcript_id: packData.transcriptId ?? undefined,
      created_at:
        packData.manifest?.created_at_ms != null
          ? new Date(packData.manifest.created_at_ms).toISOString()
          : undefined,
    }),
  });
  entries.push({ path: 'manifest.json', content: canonicalJson(packData.manifest) });
  entries.push({ path: 'CONSTITUTION_v1.md', content: packData.constitution });
  entries.push({ path: 'gc_view.json', content: canonicalJson(packData.gcView) });
  entries.push({ path: 'insurer_summary.json', content: canonicalJson(packData.insurerSummary) });

  // —— Context and metadata ——
  const claimsContext = buildClaimsContextJson(
    packData,
    claimType,
    generatedAt,
    auditorPackSha256,
    auditorPackOriginalFilename
  );
  entries.push({ path: 'claims_context.json', content: canonicalJson(claimsContext) });

  const viewerVersion = buildViewerVersionJson(packData);
  entries.push({ path: 'viewer_version.json', content: canonicalJson(viewerVersion) });

  // —— README and verify command ——
  entries.push({
    path: 'README.txt',
    content: buildReadmeTxt(transcriptId, verdict.verdict, verifyCommandOneLine),
  });
  entries.push({ path: 'verify_command.txt', content: verifyCommand });

  // —— Attachments ——
  if (attachments.length > 0) {
    const manifestEntries: Array<{ filename: string; sha256: string; size: number; added_at: string }> = [];
    for (const { file, addedAt } of attachments) {
      const buf = await file.arrayBuffer();
      const hash = await sha256Hex(buf);
      const path = `attachments/${file.name}`;
      entries.push({ path, content: new Uint8Array(buf) });
      manifestEntries.push({
        filename: file.name,
        sha256: hash,
        size: file.size,
        added_at: new Date(addedAt).toISOString(),
      });
    }
    entries.push({
      path: 'attachments_manifest.json',
      content: canonicalJson({ entries: manifestEntries }),
    });
  } else {
    entries.push({ path: 'attachments/.keep', content: '' });
  }

  // —— Deterministic sort by path ——
  entries.sort((a, b) => a.path.localeCompare(b.path, 'en'));

  // —— Compute checksums.sha256 (every file except checksums.sha256) ——
  const checksumLines: string[] = [];
  for (const { path, content } of entries) {
    const buf =
      typeof content === 'string'
        ? new TextEncoder().encode(content)
        : content instanceof Uint8Array
          ? content.buffer
          : content;
    const hash = await sha256Hex(buf);
    checksumLines.push(`${hash}  ${path}`);
  }
  const checksumsContent = checksumLines.join('\n') + (checksumLines.length ? '\n' : '');
  entries.push({ path: 'checksums.sha256', content: checksumsContent });
  entries.sort((a, b) => a.path.localeCompare(b.path, 'en'));

  // —— Build ZIP (deterministic order) ——
  const zip = new JSZip();
  for (const { path, content } of entries) {
    if (typeof content === 'string') {
      zip.file(path, content);
    } else {
      zip.file(path, content);
    }
  }

  return zip.generateAsync({ type: 'blob' });
}
