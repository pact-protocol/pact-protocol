/**
 * File-backed store: JSONL for anchors and revocations.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AnchorAttestation, RevocationRecord } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_DATA_DIR = join(__dirname, "..", "data");

function ensureDataDir(dataDir: string): void {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
}

export function getAnchorsPath(dataDir: string = DEFAULT_DATA_DIR): string {
  ensureDataDir(dataDir);
  return join(dataDir, "anchors.jsonl");
}

export function getRevocationsPath(dataDir: string = DEFAULT_DATA_DIR): string {
  ensureDataDir(dataDir);
  return join(dataDir, "revocations.jsonl");
}

export function appendAnchor(attestation: AnchorAttestation, dataDir: string = DEFAULT_DATA_DIR): void {
  const path = getAnchorsPath(dataDir);
  const line = JSON.stringify(attestation) + "\n";
  writeFileSync(path, line, { flag: "a" });
}

export function readAnchors(dataDir: string = DEFAULT_DATA_DIR): AnchorAttestation[] {
  const path = getAnchorsPath(dataDir);
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf8");
  const lines = content.trim().split("\n").filter(Boolean);
  return lines.map((line) => JSON.parse(line) as AnchorAttestation);
}

/**
 * Returns ALL anchors for the subject (including revoked and expired).
 * Consumers (Boxer/Viewer) join with revocations and warn only; do not hide revoked anchors.
 */
export function findAnchorsBySubject(
  subjectPubkey: string,
  dataDir: string = DEFAULT_DATA_DIR
): AnchorAttestation[] {
  const all = readAnchors(dataDir);
  return all.filter((a) => a.subject_signer_public_key_b58 === subjectPubkey);
}

export function appendRevocation(record: RevocationRecord, dataDir: string = DEFAULT_DATA_DIR): void {
  const path = getRevocationsPath(dataDir);
  const line = JSON.stringify(record) + "\n";
  writeFileSync(path, line, { flag: "a" });
}

export function readRevocations(dataDir: string = DEFAULT_DATA_DIR): RevocationRecord[] {
  const path = getRevocationsPath(dataDir);
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf8");
  const lines = content.trim().split("\n").filter(Boolean);
  return lines.map((line) => JSON.parse(line) as RevocationRecord);
}

export function getRevocation(
  anchorId: string,
  dataDir: string = DEFAULT_DATA_DIR
): RevocationRecord | null {
  const all = readRevocations(dataDir);
  return all.find((r) => r.anchor_id === anchorId) ?? null;
}

export function getAnchorById(
  anchorId: string,
  dataDir: string = DEFAULT_DATA_DIR
): AnchorAttestation | null {
  const all = readAnchors(dataDir);
  return all.find((a) => a.anchor_id === anchorId) ?? null;
}
