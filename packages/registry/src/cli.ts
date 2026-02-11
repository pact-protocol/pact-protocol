#!/usr/bin/env node
/**
 * Pact Registry CLI: issue, revoke, list anchors.
 *
 * Usage:
 *   pact-registry issue --subject <pubkey> --type <anchor_type> [--display-name "Acme LLC"] [--method kyb] [--payload payload.json]
 *   pact-registry revoke --anchor-id <anchor_id> [--reason "KYB expired"]
 *   pact-registry list --subject <pubkey>
 */

import "dotenv/config";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { issue } from "./issue.js";
import {
  appendAnchor,
  appendRevocation,
  findAnchorsBySubject,
  readRevocations,
} from "./store.js";
import type { IssueRequest } from "./types.js";

const ISSUER_SECRET = process.env.REGISTRY_ISSUER_SECRET_KEY_B58;
const ISSUER_PUBLIC = process.env.REGISTRY_ISSUER_PUBLIC_KEY_B58;
const DATA_DIR = process.env.REGISTRY_DATA_DIR;

function getIssuerKeys(): { publicKey: string; secretKey: string } {
  if (!ISSUER_SECRET || !ISSUER_PUBLIC) {
    console.error("Set REGISTRY_ISSUER_SECRET_KEY_B58 and REGISTRY_ISSUER_PUBLIC_KEY_B58");
    process.exit(1);
  }
  return { publicKey: ISSUER_PUBLIC, secretKey: ISSUER_SECRET };
}

function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i]!.startsWith("--") && argv[i + 1]) {
      args[argv[i]!.slice(2)] = argv[++i]!;
    }
  }
  return args;
}

function cmdIssue(): void {
  const a = parseArgs();
  const subject = a["subject"];
  const type = a["type"];
  const displayName = a["display-name"];
  const method = a["method"];
  const payloadPath = a["payload"];
  if (!subject || !type) {
    console.error("Usage: pact-registry issue --subject <pubkey> --type <anchor_type> [--display-name \"...\"] [--method kyb] [--payload payload.json]");
    process.exit(1);
  }
  let payload: Record<string, unknown> = {};
  if (payloadPath) {
    const p = resolve(process.cwd(), payloadPath);
    if (!existsSync(p)) {
      console.error("Payload file not found:", p);
      process.exit(1);
    }
    payload = JSON.parse(readFileSync(p, "utf8"));
  }
  const { publicKey, secretKey } = getIssuerKeys();
  const req: IssueRequest = {
    subject_signer_public_key_b58: subject,
    anchor_type: type,
    payload,
    display_name: displayName,
    verification_method: method,
  };
  const attestation = issue(req, publicKey, secretKey);
  appendAnchor(attestation, DATA_DIR);
  console.log(JSON.stringify(attestation, null, 2));
}

function cmdRevoke(): void {
  const a = parseArgs();
  const anchorId = a["anchor-id"];
  const reason = a["reason"];
  if (!anchorId) {
    console.error("Usage: pact-registry revoke --anchor-id <anchor_id> [--reason \"...\"]");
    process.exit(1);
  }
  const record = { anchor_id: anchorId, revoked_at_ms: Date.now(), reason };
  appendRevocation(record, DATA_DIR);
  console.log(JSON.stringify({ ok: true, revocation: record }, null, 2));
}

function cmdList(): void {
  const a = parseArgs();
  const subject = a["subject"];
  if (!subject) {
    console.error("Usage: pact-registry list --subject <pubkey>");
    process.exit(1);
  }
  const anchors = findAnchorsBySubject(subject, DATA_DIR);
  const revocations = readRevocations(DATA_DIR);
  const revokedSet = new Set(revocations.map((r) => r.anchor_id));
  const withFlag = anchors.map((att) => ({ ...att, revoked: revokedSet.has(att.anchor_id) }));
  console.log(JSON.stringify({ anchors: withFlag }, null, 2));
}

const cmd = process.argv[2];
if (cmd === "issue") cmdIssue();
else if (cmd === "revoke") cmdRevoke();
else if (cmd === "list") cmdList();
else {
  console.error("Usage: pact-registry <issue|revoke|list> ...");
  process.exit(1);
}
