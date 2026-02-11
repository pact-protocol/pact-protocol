#!/usr/bin/env node
/**
 * Boxer recompute: build passport snapshot (v0) from auditor pack + anchors.
 * Output: JSON with entities (domain-scoped), anchor badges, and recommendations.
 *
 * Usage:
 *   node recompute.js --pack <path.zip> --anchors <path.json> [--out <path.json>]
 *   node recompute.js --in <dir> --anchors <path.json> [--out <path.json>]  (uses first .zip in dir)
 *   Add --deterministic to sort JSON keys for reproducible output.
 * Default out: /tmp/passport_art_v0_4.json
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { extractDomainIdsFromTranscript, subjectToDomainId } from "../normalize.js";
import { confidenceToReliability } from "../scoring.js";

interface AnchorEntry {
  signer_public_key_b58?: string;
  subject_signer_public_key_b58?: string;
  anchor_type: string;
  label?: string;
  display_name?: string;
  verification_method?: string;
  expires_at_ms?: number | null;
  payload?: Record<string, unknown>;
  issued_at_ms?: number;
  anchor_id?: string;
  revoked?: boolean;
  revoked_at_ms?: number | null;
  reason?: string | null;
}

interface AnchorsFile {
  version?: string;
  anchors: AnchorEntry[];
}

interface TranscriptRound {
  round_number: number;
  round_type: string;
  public_key_b58?: string;
  signature?: { signer_public_key_b58?: string };
  content_summary?: {
    claims?: Array<{ agent?: string; subject?: string; conf?: number }>;
  };
}

interface Transcript {
  transcript_id?: string;
  rounds?: TranscriptRound[];
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function entityId(signerB58: string): string {
  return "entity-" + sha256Hex(JSON.stringify({ signer_public_key_b58: signerB58 }));
}

function parseArgs(): { pack: string; anchors: string; out: string; deterministic: boolean } {
  const args = process.argv.slice(2);
  let pack = "";
  let inDir = "";
  let anchors = "";
  let out = "/tmp/passport_art_v0_4.json";
  let deterministic = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--pack" && args[i + 1]) {
      pack = args[++i];
    } else if (args[i] === "--in" && args[i + 1]) {
      inDir = args[++i];
    } else if (args[i] === "--anchors" && args[i + 1]) {
      anchors = args[++i];
    } else if (args[i] === "--out" && args[i + 1]) {
      out = args[++i];
    } else if (args[i] === "--deterministic") {
      deterministic = true;
    }
  }
  if (!pack && inDir) {
    const resolved = resolve(process.cwd(), inDir);
    if (!existsSync(resolved)) {
      console.error("Directory not found: " + inDir);
      process.exit(1);
    }
    const names = readdirSync(resolved).filter((n) => n.endsWith(".zip")).sort();
    if (names.length === 0) {
      console.error("No .zip files in directory: " + inDir);
      process.exit(1);
    }
    pack = resolve(resolved, names[0]);
    if (names.length > 1) {
      console.error("Using first pack (deterministic order): " + names[0]);
    }
  }
  return { pack, anchors, out, deterministic };
}

async function loadTranscriptFromZip(zipPath: string): Promise<Transcript> {
  const buf = readFileSync(zipPath);
  const zip = await JSZip.loadAsync(buf);
  const entry = zip.file("input/transcript.json");
  if (!entry) throw new Error("Pack missing input/transcript.json");
  const text = await entry.async("string");
  return JSON.parse(text) as Transcript;
}

async function loadPackTranscript(packPath: string): Promise<Transcript> {
  const resolved = resolve(process.cwd(), packPath);
  if (!existsSync(resolved)) throw new Error("Pack not found: " + packPath);
  return loadTranscriptFromZip(resolved);
}

function loadAnchors(anchorsPath: string): AnchorsFile {
  const resolved = resolve(process.cwd(), anchorsPath);
  if (!existsSync(resolved)) {
    const msg =
      anchorsPath.includes("issued_stripe_anchor") || resolved.includes("issued_stripe_anchor")
        ? `Anchors file not found: ${anchorsPath}. Create it first by running ./scripts/issue_demo_platform_stripe.sh (with the registry running).`
        : "Anchors file not found: " + anchorsPath;
    throw new Error(msg);
  }
  const raw = JSON.parse(readFileSync(resolved, "utf8"));
  if (!Array.isArray(raw.anchors)) throw new Error("Anchors file must have .anchors array");
  return raw as AnchorsFile;
}

function getSignersFromTranscript(transcript: Transcript): string[] {
  const set = new Set<string>();
  for (const r of transcript.rounds ?? []) {
    const pk = r.public_key_b58 ?? r.signature?.signer_public_key_b58;
    if (pk) set.add(pk);
  }
  return [...set].sort();
}

function buildDomainsFromTranscript(transcript: Transcript): Map<string, { domain_id: string; reliability_score: number }> {
  const domainScores = new Map<string, number[]>();
  for (const round of transcript.rounds ?? []) {
    const claims = round.content_summary?.claims;
    if (!Array.isArray(claims)) continue;
    for (const c of claims) {
      const d = subjectToDomainId(c.subject);
      if (d && typeof c.conf === "number") {
        const arr = domainScores.get(d) ?? [];
        arr.push(c.conf);
        domainScores.set(d, arr);
      }
    }
  }
  const out = new Map<string, { domain_id: string; reliability_score: number }>();
  for (const [domain_id, confs] of domainScores) {
    const maxConf = confs.length ? Math.max(...confs) : 0.5;
    out.set(domain_id, { domain_id, reliability_score: confidenceToReliability(maxConf) });
  }
  return out;
}

/** Detect disagreement on art:authenticity before rerun (low vs high confidence). */
function computeRecommendations(transcript: Transcript): Array<{ type: string; domain_id?: string; message: string }> {
  const recommendations: Array<{ type: string; domain_id?: string; message: string }> = [];
  const authenticityConfs: number[] = [];
  let hasRerun = false;
  for (const round of transcript.rounds ?? []) {
    const claims = round.content_summary?.claims ?? [];
    for (const c of claims) {
      if (subjectToDomainId(c.subject) === "art:authenticity" && typeof c.conf === "number") {
        authenticityConfs.push(c.conf);
        if (c.conf >= 0.9) hasRerun = true;
      }
    }
  }
  if (authenticityConfs.length > 0) {
    const minConf = Math.min(...authenticityConfs);
    const maxConf = Math.max(...authenticityConfs);
    if (maxConf >= 0.9 && minConf < 0.8) {
      if (hasRerun) {
        recommendations.push({
          type: "cleared",
          domain_id: "art:authenticity",
          message: "Rerun completed; high-confidence result on art:authenticity.",
        });
      } else {
        recommendations.push({
          type: "rerun_escalate",
          domain_id: "art:authenticity",
          message: "Disagreement or low confidence on authenticity; recommend rerun or escalation.",
        });
      }
    }
  }

  // API procurement: min_reliability_gate / min_calibration_gate and provider selection
  if (transcript.intent_type === "api.procurement") {
    const intentRound = transcript.rounds?.find((r) => r.round_type === "INTENT");
    const cs = intentRound?.content_summary as { min_reliability_gate?: number; min_calibration_gate?: number } | undefined;
    if (cs?.min_reliability_gate != null) {
      recommendations.push({
        type: "trust_gate",
        domain_id: "api:reliability",
        message: `Buyer min_reliability_gate=${cs.min_reliability_gate}; select provider meeting gate.`,
      });
    }
    if (cs?.min_calibration_gate != null) {
      recommendations.push({
        type: "trust_gate",
        domain_id: "api:reliability",
        message: `Buyer min_calibration_gate=${cs.min_calibration_gate}; select provider meeting gate.`,
      });
    }
    const acceptRound = transcript.rounds?.find((r) => r.round_type === "ACCEPT");
    const acceptCs = acceptRound?.content_summary as { selected_provider?: string; to?: string } | undefined;
    if (acceptCs?.selected_provider || acceptCs?.to) {
      recommendations.push({
        type: "provider_selection",
        domain_id: "api:reliability",
        message: "Provider selected per trust gate (reliability/calibration); see Economic Details.",
      });
    }
  }
  return recommendations;
}

function sortObjectKeys<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sortObjectKeys) as T;
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj as Record<string, unknown>).sort()) {
    sorted[k] = sortObjectKeys((obj as Record<string, unknown>)[k]);
  }
  return sorted as T;
}

async function main(): Promise<void> {
  const { pack, anchors, out, deterministic } = parseArgs();
  if (!pack || !anchors) {
    console.error("Usage: recompute --pack <auditor_pack.zip> --anchors <anchors.json> [--out /tmp/passport_art_v0_4.json]");
    console.error("   or: recompute --in <dir> --anchors <anchors.json> [--out ...] [--deterministic]");
    process.exit(1);
  }

  const transcript = await loadPackTranscript(pack);
  const anchorsFile = loadAnchors(anchors);

  const signers = getSignersFromTranscript(transcript);
  const domainIds = extractDomainIdsFromTranscript(transcript);
  const domainsBySigner = buildDomainsFromTranscript(transcript);
  const anchorsByKey = new Map<string, AnchorEntry[]>();
  for (const a of anchorsFile.anchors) {
    const signerKey = a.signer_public_key_b58 ?? a.subject_signer_public_key_b58 ?? "";
    if (!signerKey) continue;
    const list = anchorsByKey.get(signerKey) ?? [];
    list.push(a);
    anchorsByKey.set(signerKey, list);
  }

  const REVOCATION_PENALTY_PER_ANCHOR = 10;
  const REVOCATION_PENALTY_CAP = 20;

  const entities: Array<{
    entity_id: string;
    signer_public_key_b58: string;
    software_attestation?: { agent_impl_id: string; agent_version: string };
    domains: Array<{ domain_id: string; metrics?: { reliability_score: number }; anchors?: unknown[] }>;
    anchors: Array<{
      type: string;
      issuer?: string;
      anchor_id?: string;
      revoked?: boolean;
      revoked_at_ms?: number | null;
      reason?: string | null;
      [k: string]: unknown;
    }>;
  }> = [];

  for (const signer of signers) {
    const anchorList = anchorsByKey.get(signer) ?? [];
    const revokedCount = anchorList.filter((a) => a.revoked === true).length;
    const hasTrustAnchor = anchorList.some(
      (a) =>
        a.anchor_type === "kyb_verified" ||
        a.anchor_type === "platform_verified" ||
        a.anchor_type === "service_account_verified" ||
        a.anchor_type === "oidc_verified"
    );
    let defaultReliability = hasTrustAnchor ? 55 : 50;
    if (revokedCount > 0) {
      const penalty = Math.min(REVOCATION_PENALTY_CAP, revokedCount * REVOCATION_PENALTY_PER_ANCHOR);
      defaultReliability = Math.max(0, defaultReliability - penalty);
    }
    const doms = domainIds.length
      ? domainIds.map((domain_id) => {
          const info = domainsBySigner.get(domain_id) ?? { domain_id, reliability_score: defaultReliability };
          return {
            domain_id: info.domain_id,
            metrics: { reliability_score: info.reliability_score },
          };
        })
      : [{ domain_id: "default", metrics: { reliability_score: defaultReliability } }];
    const anchorBadges = anchorList.map((a) => ({
      type: a.anchor_type,
      issuer: a.label ?? a.display_name ?? undefined,
      anchor_id: a.anchor_id ?? (a.signer_public_key_b58 ?? a.subject_signer_public_key_b58 ?? "").slice(0, 12) + "...",
      display_name: a.display_name,
      verification_method: a.verification_method,
      ...(a.payload != null && { payload: a.payload }),
      ...(a.issued_at_ms != null && { issued_at_ms: a.issued_at_ms }),
      ...(a.revoked != null && { revoked: a.revoked }),
      ...(a.revoked_at_ms != null && { revoked_at_ms: a.revoked_at_ms }),
      ...(a.reason != null && a.reason !== "" && { reason: a.reason }),
    }));
    entities.push({
      entity_id: entityId(signer),
      signer_public_key_b58: signer,
      software_attestation: { agent_impl_id: "unknown", agent_version: "unknown" },
      domains: doms,
      anchors: anchorBadges,
    });
  }

  // Include anchor-only entities (e.g. experts that didn't sign the transcript but are in anchors)
  const seenSigners = new Set(signers);
  for (const [pk, anchorList] of anchorsByKey) {
    if (seenSigners.has(pk)) continue;
    const revokedCount = anchorList.filter((a) => a.revoked === true).length;
    let rel = 50;
    if (revokedCount > 0) {
      const penalty = Math.min(REVOCATION_PENALTY_CAP, revokedCount * REVOCATION_PENALTY_PER_ANCHOR);
      rel = Math.max(0, rel - penalty);
    }
    entities.push({
      entity_id: entityId(pk),
      signer_public_key_b58: pk,
      software_attestation: { agent_impl_id: "unknown", agent_version: "unknown" },
      domains: domainIds.length ? domainIds.map((d) => ({ domain_id: d, metrics: { reliability_score: rel } })) : [{ domain_id: "default", metrics: { reliability_score: rel } }],
      anchors: anchorList.map((a) => ({
        type: a.anchor_type,
        issuer: a.label ?? a.display_name,
        anchor_id: a.anchor_id ?? (a.signer_public_key_b58 ?? a.subject_signer_public_key_b58 ?? "").slice(0, 12) + "...",
        display_name: a.display_name,
        verification_method: a.verification_method,
        ...(a.payload != null && { payload: a.payload }),
        ...(a.issued_at_ms != null && { issued_at_ms: a.issued_at_ms }),
        ...(a.revoked != null && { revoked: a.revoked }),
        ...(a.revoked_at_ms != null && { revoked_at_ms: a.revoked_at_ms }),
        ...(a.reason != null && a.reason !== "" && { reason: a.reason }),
      })),
    });
  }

  entities.sort((a, b) => a.entity_id.localeCompare(b.entity_id));

  const recommendations = computeRecommendations(transcript);

  // Add revocation warnings: one per revoked anchor (avoid_revoked_identity) and optional delta-style entry
  for (const e of entities) {
    for (const a of e.anchors ?? []) {
      if (a.revoked === true) {
        recommendations.push({
          type: "avoid_revoked_identity",
          message: "Identity attestation revoked. Treat trust signals as degraded.",
          ...(a.anchor_id && { ref: a.anchor_id }),
          ...(a.reason && { reason: a.reason }),
        });
        recommendations.push({
          type: "revocation_warning",
          message: "Identity attestation revoked.",
          ref: a.anchor_id ?? "",
          magnitude: -1,
        });
      }
    }
  }

  const snapshot = {
    version: "pact-passport-snapshot/0.0",
    scoring_version: "boxer/0.1.0",
    generated_at_ms: Date.now(),
    source_manifest_hashes: [transcript.transcript_id ?? ""],
    snapshot_id: "snapshot-" + sha256Hex(JSON.stringify({ version: "pact-passport-snapshot/0.0", entities, recommendations })),
    entities,
    recommendations,
  };

  const outPath = resolve(process.cwd(), out);
  const toWrite = deterministic ? sortObjectKeys(snapshot) : snapshot;
  writeFileSync(outPath, JSON.stringify(toWrite, null, 2), "utf8");
  console.error(`Wrote ${outPath}`);
  console.error(`  Entities: ${entities.length}, Anchors: ${anchorsFile.anchors.length}, Recommendations: ${recommendations.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
