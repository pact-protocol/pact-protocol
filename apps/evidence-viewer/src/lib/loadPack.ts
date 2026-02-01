import type { AuditorPackData, Judgment, InsurerSummary, Manifest, GCView } from '../types';
import { computePackIntegrity } from './packIntegrity';

type ZipInstance = Awaited<ReturnType<Awaited<typeof import('jszip')>['loadAsync']>>;

/** Get all relative paths in the zip (no leading slashes, normalized). */
function getAllPaths(zip: ZipInstance): string[] {
  const paths: string[] = [];
  zip.forEach((relativePath, file) => {
    if (!file.dir) {
      paths.push(relativePath.replace(/^\/+/, ''));
    }
  });
  return paths.sort();
}

/**
 * Find one file in the zip: try exact path first, then first path matching any pattern.
 * Patterns are tested on the full path (e.g. "transcript", "manifest.json").
 */
function findPath(
  paths: string[],
  exactFirst: string | null,
  ...patterns: Array<string | RegExp>
): string | null {
  if (exactFirst && paths.includes(exactFirst)) return exactFirst;
  for (const p of patterns) {
    const match = paths.find((path) =>
      typeof p === 'string' ? path.includes(p) : p.test(path)
    );
    if (match) return match;
  }
  return null;
}

/** Read JSON from zip entry by path. */
async function readJson(zip: ZipInstance, path: string): Promise<unknown> {
  const file = zip.file(path);
  if (!file) throw new Error(`File not found: ${path}`);
  const raw = await file.async('string');
  return JSON.parse(raw) as unknown;
}

/** Read text from zip entry by path. */
async function readText(zip: ZipInstance, path: string): Promise<string> {
  const file = zip.file(path);
  if (!file) throw new Error(`File not found: ${path}`);
  return await file.async('string');
}

function buildMissingError(required: string[], found: string[]): string {
  const foundList = found.length ? found.join(', ') : '(none)';
  return `Required file(s) missing: ${required.join(', ')}. Files in pack: ${foundList}`;
}

export async function loadPackFromFile(file: File): Promise<AuditorPackData> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(file);
  const paths = getAllPaths(zip);

  // --- Transcript (required): canonical path input/transcript.json, fallback to transcript*.json
  const transcriptPath =
    paths.includes('input/transcript.json')
      ? 'input/transcript.json'
      : findPath(paths, null, /transcript.*\.json$/i, 'transcript.json');
  if (!transcriptPath) {
    throw new Error(buildMissingError(['input/transcript.json or transcript.json'], paths));
  }
  const transcriptRaw = await readText(zip, transcriptPath);
  let transcriptId = '';
  let transcriptParsed: unknown;
  try {
    transcriptParsed = JSON.parse(transcriptRaw) as { transcript_id?: string };
    transcriptId = (transcriptParsed as { transcript_id?: string }).transcript_id || '';
  } catch {
    transcriptParsed = null;
    transcriptId = '';
  }

  // --- Manifest: prefer manifest.json, then manifest*.json
  const manifestPath = findPath(paths, 'manifest.json', 'manifest.json', /manifest.*\.json$/i) ?? null;
  if (!manifestPath) {
    throw new Error(buildMissingError(['manifest.json'], paths));
  }
  const manifest = (await readJson(zip, manifestPath)) as Manifest;

  // --- GC View: prefer derived/gc_view.json, then *gc*view*.json
  const gcViewPath =
    findPath(paths, 'derived/gc_view.json', 'derived/gc_view.json', /gc_view\.json$/i, /derived\/.*gc.*view/i) ?? null;
  if (!gcViewPath) {
    throw new Error(buildMissingError(['derived/gc_view.json'], paths));
  }
  const gcView = (await readJson(zip, gcViewPath)) as GCView;

  // --- Judgment (DBL): prefer derived/judgment.json, then judgment*.json
  const judgmentPath =
    findPath(paths, 'derived/judgment.json', /judgment.*\.json$/i, 'judgment.json') ?? null;
  if (!judgmentPath) {
    throw new Error(buildMissingError(['judgment (e.g. derived/judgment.json)'], paths));
  }
  const judgment = (await readJson(zip, judgmentPath)) as Judgment;

  // --- Insurer summary: prefer derived/insurer_summary.json
  const insurerSummaryPath =
    findPath(paths, 'derived/insurer_summary.json', 'insurer_summary.json', /insurer_summary.*\.json$/i) ?? null;
  if (!insurerSummaryPath) {
    throw new Error(buildMissingError(['derived/insurer_summary.json'], paths));
  }
  const insurerSummary = (await readJson(zip, insurerSummaryPath)) as InsurerSummary;

  // --- Checksums (optional; if absent, integrityResult.checksums.status will be UNAVAILABLE)
  const checksumsPath = findPath(paths, 'checksums.sha256', 'checksums.sha256', /checksums?\.(sha256|txt)/i) ?? null;
  const checksumsText = checksumsPath ? await readText(zip, checksumsPath) : '';

  // --- Constitution: prefer constitution/CONSTITUTION_v1.md, then constitution/*.md
  const constitutionPath =
    findPath(paths, 'constitution/CONSTITUTION_v1.md', 'constitution/CONSTITUTION_v1.md', /constitution\/.*\.md$/i) ?? null;
  if (!constitutionPath) {
    throw new Error(buildMissingError(['constitution (e.g. constitution/CONSTITUTION_v1.md)'], paths));
  }
  const constitution = await readText(zip, constitutionPath);

  // Fallbacks for transcript_id
  if (!transcriptId) transcriptId = manifest.transcript_id || '';
  if (!transcriptId && gcView.subject?.transcript_id_or_hash) transcriptId = gcView.subject.transcript_id_or_hash;
  if (!transcriptId) transcriptId = 'UNKNOWN';

  // Build allFilesMap (path -> ArrayBuffer) for integrity checksums verification
  const allFilesMap = new Map<string, ArrayBuffer>();
  for (const p of paths) {
    const file = zip.file(p);
    if (file && !file.dir) {
      const buf = await file.async('arraybuffer');
      allFilesMap.set(p, buf);
    }
  }

  // Optional: merkle digest
  let merkleDigest: AuditorPackData['merkleDigest'];
  const merklePath = findPath(paths, 'derived/merkle_digest.json', 'merkle_digest.json');
  if (merklePath) {
    try {
      merkleDigest = (await readJson(zip, merklePath)) as AuditorPackData['merkleDigest'];
    } catch {
      merkleDigest = undefined;
    }
  } else {
    merkleDigest = undefined;
  }

  // Client-side integrity from pack contents only (input/transcript.json hash chain, checksums, signatures)
  let integrityResult: AuditorPackData['integrityResult'];
  try {
    if (!transcriptParsed) {
      throw new Error('Transcript parse failed');
    }
    integrityResult = await computePackIntegrity({
      transcript: transcriptParsed,
      allFilesMap,
      checksumsText: checksumsPath ? checksumsText : null,
    });
  } catch (e) {
    integrityResult = {
      status: 'INDETERMINATE',
      checksums: { status: 'UNAVAILABLE', checkedCount: 0, totalCount: 0, failures: [] },
      hashChain: { status: 'INVALID', details: 'Transcript parsing or integrity computation failed' },
      signatures: { status: 'UNVERIFIABLE', verifiedCount: 0, totalCount: 0, failures: [] },
      warnings: [e instanceof Error ? e.message : 'Failed to compute pack integrity'],
    };
  }

  return {
    manifest,
    gcView,
    judgment,
    insurerSummary,
    checksums: checksumsText,
    constitution,
    transcript: transcriptRaw,
    transcriptId,
    zipFile: file,
    merkleDigest,
    integrityResult,
    // Verify command path: demo loaders override with packs/<file>.zip; drag-drop keeps filename
    packVerifyPath: file.name,
  };
}

export async function loadPackFromUrl(url: string): Promise<AuditorPackData> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch pack: ${response.statusText}`);
  }
  const blob = await response.blob();
  const fileName = url.split('/').pop() || 'pack.zip';
  const file = new File([blob], fileName, { type: 'application/zip' });
  return loadPackFromFile(file);
}

export function formatDate(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}

export function truncateHash(hash: string, length: number = 16): string {
  if (hash.length <= length) return hash;
  return hash.substring(0, length) + '...';
}

export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}
