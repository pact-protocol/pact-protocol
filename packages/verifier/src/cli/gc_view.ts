#!/usr/bin/env node
/**
 * GC View CLI
 *
 * Generates a General Counsel-readable summary from a v4 transcript.
 * Default: transcript-only (--transcript). Optional: evidence bundle (--bundle).
 *
 * Usage:
 *   pnpm -C packages/verifier gc-view --transcript <path> [--out <file>]
 *   pnpm -C packages/verifier gc-view --bundle <dir> [--out <file>]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, isAbsolute, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TranscriptV4 } from "../util/transcript_verify.js";
import { renderGCView } from "../gc_view/renderer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "../../../..");

interface ParsedArgs {
  transcript?: string;
  bundle?: string;
  out?: string;
}

function parseArgs(): ParsedArgs {
  const args: ParsedArgs = {};
  let i = 2;

  while (i < process.argv.length) {
    const arg = process.argv[i];

    if (arg === "--transcript" && i + 1 < process.argv.length) {
      args.transcript = process.argv[++i];
    } else if (arg === "--bundle" && i + 1 < process.argv.length) {
      args.bundle = process.argv[++i];
    } else if (arg === "--out" && i + 1 < process.argv.length) {
      args.out = process.argv[++i];
    } else if (arg.startsWith("--")) {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
    i++;
  }

  return args;
}

/**
 * Load transcript from file.
 */
function loadTranscript(path: string): TranscriptV4 {
  let resolvedPath: string;
  if (isAbsolute(path)) {
    resolvedPath = path;
  } else if (existsSync(path)) {
    resolvedPath = resolve(process.cwd(), path);
  } else {
    resolvedPath = resolve(repoRoot, path);
    if (!existsSync(resolvedPath)) {
      throw new Error(
        `Transcript file not found: ${path}\n  Tried: ${resolve(process.cwd(), path)}\n  Tried: ${resolvedPath}`
      );
    }
  }

  const content = readFileSync(resolvedPath, "utf-8");
  return JSON.parse(content) as TranscriptV4;
}

/**
 * Load transcript from evidence bundle directory.
 * Looks for transcript.json, manifest.json entries, or any .json with transcript_version pact-transcript/4.0.
 */
function loadTranscriptFromBundle(bundleDir: string): { transcript: TranscriptV4; transcriptPath: string } {
  let resolvedDir: string;
  if (isAbsolute(bundleDir)) {
    resolvedDir = bundleDir;
  } else if (existsSync(bundleDir) && statSync(bundleDir).isDirectory()) {
    resolvedDir = resolve(process.cwd(), bundleDir);
  } else {
    resolvedDir = resolve(repoRoot, bundleDir);
    if (!existsSync(resolvedDir) || !statSync(resolvedDir).isDirectory()) {
      throw new Error(
        `Bundle directory not found: ${bundleDir}\n  Tried: ${resolve(process.cwd(), bundleDir)}\n  Tried: ${resolvedDir}`
      );
    }
  }

  const transcriptPath = join(resolvedDir, "transcript.json");
  if (existsSync(transcriptPath)) {
    return {
      transcript: loadTranscript(transcriptPath),
      transcriptPath,
    };
  }

  const manifestPath = join(resolvedDir, "manifest.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    if (manifest.entries && Array.isArray(manifest.entries)) {
      const transcriptEntry = manifest.entries.find((e: { type?: string }) => e.type === "transcript");
      if (transcriptEntry?.path) {
        const foundPath = join(resolvedDir, transcriptEntry.path);
        if (existsSync(foundPath)) {
          return {
            transcript: loadTranscript(foundPath),
            transcriptPath: foundPath,
          };
        }
      }
    }
  }

  const files = readdirSync(resolvedDir);
  for (const file of files) {
    if (file.endsWith(".json") && file !== "manifest.json") {
      const candidatePath = join(resolvedDir, file);
      try {
        const content = JSON.parse(readFileSync(candidatePath, "utf-8"));
        if (content.transcript_version === "pact-transcript/4.0") {
          return {
            transcript: content as TranscriptV4,
            transcriptPath: candidatePath,
          };
        }
      } catch {
        /* skip */
      }
    }
  }

  throw new Error(`No transcript found in bundle directory: ${bundleDir}`);
}

/**
 * Normalize path to relative if possible.
 */
function normalizePath(path: string): string {
  if (isAbsolute(path)) {
    if (path.startsWith(repoRoot + "/")) {
      return path.slice(repoRoot.length + 1);
    }
    if (path.startsWith(process.cwd() + "/")) {
      return path.slice(process.cwd().length + 1);
    }
  }
  return path;
}

export async function main(): Promise<void> {
  try {
    const args = parseArgs();

    let transcript: TranscriptV4;
    let transcriptPath: string;
    let bundlePath: string | undefined;

    if (args.bundle) {
      const result = loadTranscriptFromBundle(args.bundle);
      transcript = result.transcript;
      transcriptPath = normalizePath(result.transcriptPath);
      bundlePath = normalizePath(args.bundle);
    } else if (args.transcript) {
      transcript = loadTranscript(args.transcript);
      transcriptPath = normalizePath(args.transcript);
    } else {
      console.error("Usage: gc_view --transcript <path> [--out <file>]");
      console.error("   or: gc_view --bundle <dir> [--out <file>]");
      process.exitCode = 1;
      return;
    }

    const gcView = await renderGCView(transcript, {
      transcriptPath,
      bundlePath,
    });

    const jsonOutput = JSON.stringify(gcView, null, 2);

    if (args.out) {
      const resolvedOut = isAbsolute(args.out) ? args.out : resolve(process.cwd(), args.out);
      writeFileSync(resolvedOut, jsonOutput, "utf-8");
      console.error(`GC view written to: ${resolvedOut}`);
    } else {
      console.log(jsonOutput);
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exitCode = 1;
    return;
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("gc_view.ts")) {
  main().catch((error) => {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exitCode = 1;
  });
}
