#!/usr/bin/env node
/**
 * Pact Registry HTTP service: issue and revoke anchor attestations.
 */

import { config } from "dotenv";
import { resolve } from "node:path";
// Load .env then .env.registry (repo root when run from packages/registry)
config();
if (!process.env.REGISTRY_ISSUER_SECRET_KEY_B58 || !process.env.REGISTRY_ISSUER_PUBLIC_KEY_B58) {
  config({ path: resolve(process.cwd(), ".env.registry") });
  if (!process.env.REGISTRY_ISSUER_SECRET_KEY_B58 || !process.env.REGISTRY_ISSUER_PUBLIC_KEY_B58) {
    config({ path: resolve(process.cwd(), "../../.env.registry") });
  }
}
import express from "express";
import { createHash } from "node:crypto";
import {
  readAnchors,
  appendAnchor,
  readRevocations,
  appendRevocation,
  findAnchorsBySubject,
  getRevocation,
  getAnchorsPath,
} from "./store.js";
import { issue } from "./issue.js";
import { validatePlatformVerifiedPayload } from "./validatePlatformVerified.js";
import { validateServiceAccountPayload } from "./validateServiceAccount.js";
import { validateOidcPayload } from "./validateOidc.js";
import { validateBase58Field } from "./validateBase58.js";
import type { IssueRequest, RevokeRequest } from "./types.js";

const app = express();
app.use(express.json({ limit: "64kb" }));

// Root: minimal response when opening the registry URL in a browser (no CSP to avoid blocking DevTools)
app.get("/", (_req, res) => {
  res.json({
    service: "Pact Registry",
    version: "0.1.0",
    docs: "See docs/IDENTITY_LAYER_MVP.md",
    endpoints: ["POST /v1/anchors/issue", "POST /v1/anchors/revoke", "GET /v1/anchors/by-subject/:key", "GET /v1/revocations/:anchor_id"],
  });
});

// Chrome DevTools requests this; return 200 so the console stays clean (no 404 / no CSP violation)
app.get("/.well-known/appspecific/com.chrome.devtools.json", (_req, res) => {
  res.status(200).json({});
});

const API_KEY = process.env.REGISTRY_API_KEY || "dev-api-key";
const DATA_DIR = process.env.REGISTRY_DATA_DIR || undefined; // uses default in store

function getIssuerKeys(): { publicKey: string; secretKey: string } {
  const secret = process.env.REGISTRY_ISSUER_SECRET_KEY_B58;
  const publicKey = process.env.REGISTRY_ISSUER_PUBLIC_KEY_B58;
  if (!secret || !publicKey) {
    throw new Error(
      "REGISTRY_ISSUER_SECRET_KEY_B58 and REGISTRY_ISSUER_PUBLIC_KEY_B58 must be set. " +
        "From repo root run: node scripts/gen_registry_keys.mjs (creates .env.registry)"
    );
  }
  return { publicKey, secretKey: secret };
}

function requireApiKey(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const key = req.headers["x-api-key"] || req.query?.api_key;
  if (key !== API_KEY) {
    res.status(401).json({ error: "Unauthorized: invalid or missing API key" });
    return;
  }
  next();
}

// POST /v1/anchors/issue
app.post("/v1/anchors/issue", requireApiKey, (req, res) => {
  try {
    const { publicKey, secretKey } = getIssuerKeys();
    const body = req.body as IssueRequest;
    if (!body.subject_signer_public_key_b58 || !body.anchor_type || !body.payload) {
      res.status(400).json({
        error: "Missing required fields: subject_signer_public_key_b58, anchor_type, payload",
      });
      return;
    }
    try {
      validateBase58Field(body.subject_signer_public_key_b58, "subject_signer_public_key_b58");
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
      return;
    }
    try {
      validatePlatformVerifiedPayload(body.anchor_type, body.payload as Record<string, unknown>);
      validateServiceAccountPayload(body.anchor_type, body.payload as Record<string, unknown>);
      validateOidcPayload(body.anchor_type, body.payload as Record<string, unknown>);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
      return;
    }
    const attestation = issue(
      {
        subject_signer_public_key_b58: body.subject_signer_public_key_b58,
        anchor_type: body.anchor_type,
        payload: body.payload,
        display_name: body.display_name,
        verification_method: body.verification_method,
        expires_at_ms: body.expires_at_ms,
        evidence_refs: body.evidence_refs,
      },
      publicKey,
      secretKey
    );
    appendAnchor(attestation, DATA_DIR);
    res.status(201).json({ anchor_attestation: attestation });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("base58") || msg.includes("Non-base58")) {
      res.status(500).json({
        error: msg,
        hint: "If this happens after validation passed, REGISTRY_ISSUER_SECRET_KEY_B58 may be invalid. Regenerate with: node scripts/gen_registry_keys.mjs and load .env.registry",
      });
      return;
    }
    res.status(500).json({ error: msg });
  }
});

// POST /v1/anchors/revoke
app.post("/v1/anchors/revoke", requireApiKey, (req, res) => {
  try {
    const body = req.body as RevokeRequest;
    if (!body.anchor_id) {
      res.status(400).json({ error: "Missing anchor_id" });
      return;
    }
    const revoked_at_ms = body.revoked_at_ms ?? Date.now();
    const record = { anchor_id: body.anchor_id, revoked_at_ms, reason: body.reason };
    appendRevocation(record, DATA_DIR);
    res.json({ ok: true, revocation: record });
  } catch (e) {
    res.status(500).json({ error: String(e instanceof Error ? e.message : e) });
  }
});

// GET /v1/anchors/by-subject/:subject_pubkey
// Returns ALL anchors for the subject (including revoked). Revoked anchors include revoked, revoked_at_ms, reason.
app.get("/v1/anchors/by-subject/:subject_pubkey", (req, res) => {
  try {
    const subject_pubkey = decodeURIComponent(req.params.subject_pubkey);
    const anchors = findAnchorsBySubject(subject_pubkey, DATA_DIR);
    const revocations = readRevocations(DATA_DIR);
    const revocationByAnchorId = new Map(revocations.map((r) => [r.anchor_id, r]));
    const now = Date.now();
    const withRevocation = anchors.map((a) => {
      const rev = revocationByAnchorId.get(a.anchor_id);
      const expired = a.expires_at_ms != null && a.expires_at_ms < now;
      return {
        ...a,
        revoked: !!rev,
        ...(rev && { revoked_at_ms: rev.revoked_at_ms, reason: rev.reason }),
        ...(expired && { expired: true }),
      };
    });
    withRevocation.sort((a, b) => (b.issued_at_ms ?? 0) - (a.issued_at_ms ?? 0));
    res.json({ anchors: withRevocation });
  } catch (e) {
    res.status(500).json({ error: String(e instanceof Error ? e.message : e) });
  }
});

// GET /v1/revocations/:anchor_id
app.get("/v1/revocations/:anchor_id", (req, res) => {
  try {
    const anchor_id = decodeURIComponent(req.params.anchor_id);
    const rev = getRevocation(anchor_id, DATA_DIR);
    if (!rev) {
      res.json({ revoked: false });
      return;
    }
    res.json({ revoked: true, revoked_at_ms: rev.revoked_at_ms, reason: rev.reason });
  } catch (e) {
    res.status(500).json({ error: String(e instanceof Error ? e.message : e) });
  }
});

const DEFAULT_PORT = 3099;
const PORT = Number(process.env.PORT) || DEFAULT_PORT;

function tryListen(port: number): void {
  const server = app.listen(port, () => {
    console.error(`Pact Registry listening on http://localhost:${port}`);
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      if (port === PORT && !process.env.PORT) {
        const next = port + 1;
        console.error(`Port ${port} in use, trying ${next}...`);
        tryListen(next);
      } else {
        console.error(`Port ${port} is in use. Stop the other process or set PORT to a different port.`);
        process.exit(1);
      }
    } else {
      console.error(err);
      process.exit(1);
    }
  });
}

function main(): void {
  try {
    getIssuerKeys();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
  tryListen(PORT);
}

main();
