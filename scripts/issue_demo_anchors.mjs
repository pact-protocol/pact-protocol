#!/usr/bin/env node
/**
 * Issue demo anchors for art + api pilots and write fixtures/anchors/issued_<date>.json.
 * Loads .env.registry (create with node scripts/gen_registry_keys.mjs) or REGISTRY_* env vars.
 */

import { config } from "dotenv";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
if (existsSync(join(repoRoot, ".env.registry"))) {
  config({ path: join(repoRoot, ".env.registry") });
} else {
  config();
}

// Load registry package (issue function). Build first: pnpm -C packages/registry build
const { issue } = await import("../packages/registry/dist/index.js");

const PUBLIC = process.env.REGISTRY_ISSUER_PUBLIC_KEY_B58;
const SECRET = process.env.REGISTRY_ISSUER_SECRET_KEY_B58;
if (!PUBLIC || !SECRET) {
  console.error("Set REGISTRY_ISSUER_PUBLIC_KEY_B58 and REGISTRY_ISSUER_SECRET_KEY_B58 (e.g. run node scripts/gen_registry_keys.mjs)");
  process.exit(1);
}

const artPubkeys = {
  gallery: "DCi6DFQteG5nfh8WDDTxYsd7yoeB7bJiYErgohRaaUgA",
  expert_a: "H2eeyMqhkLw1q7k1kuLJS5WCxv66w6yNYsTpvxPmTyTG",
  expert_b: "7vqQqT3Ds9WfM3T8PGEDkwgqu9qV8733HBVcj4Ee8y88",
  provenance: "J16RoSSAux4rQsUjnynHcNjx6tAo2v6T2efvwNdZeREN",
};
const apiPubkeys = {
  provider_b: "CACXbtJrzCQqTJ3Ms5EYjgmd4xccVm6uADUYLHZuMYLx",
  buyer: "8ZaPoHZtaRRSCgbWyDAbBAjGv9h8kY8JYJpaVrZtnc97",
};

const definitions = [
  { subject: artPubkeys.gallery, anchor_type: "kyb_verified", display_name: "Acme Gallery LLC", method: "kyb" },
  { subject: artPubkeys.expert_a, anchor_type: "credential_verified", display_name: "Human Expert A", method: "credential" },
  { subject: artPubkeys.expert_b, anchor_type: "credential_verified", display_name: "Human Expert B", method: "credential" },
  { subject: artPubkeys.provenance, anchor_type: "domain_verified", display_name: "Provenance Agent", method: "api_key" },
  { subject: apiPubkeys.provider_b, anchor_type: "kyb_verified", display_name: "Acme Data LLC", method: "kyb" },
  { subject: apiPubkeys.provider_b, anchor_type: "platform_verified", display_name: "Acme Data LLC", method: "api_key" },
  { subject: apiPubkeys.buyer, anchor_type: "oidc_verified", display_name: "Enterprise Buyer", method: "oidc" },
];

const attestations = [];
for (const def of definitions) {
  const att = issue(
    {
      subject_signer_public_key_b58: def.subject,
      anchor_type: def.anchor_type,
      payload: { scope: "demo", label: def.display_name },
      display_name: def.display_name,
      verification_method: def.method,
    },
    PUBLIC,
    SECRET
  );
  attestations.push(att);
}

const outDir = join(repoRoot, "fixtures", "anchors");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const date = new Date().toISOString().slice(0, 10);
const outPath = join(outDir, `issued_${date}.json`);

const forBoxer = {
  version: "anchors/1.0",
  issued_at: new Date().toISOString(),
  attestations,
  anchors: attestations.map((a) => ({
    subject_signer_public_key_b58: a.subject_signer_public_key_b58,
    signer_public_key_b58: a.subject_signer_public_key_b58,
    anchor_type: a.anchor_type,
    display_name: a.display_name,
    verification_method: a.verification_method,
    label: a.display_name,
  })),
};
writeFileSync(outPath, JSON.stringify(forBoxer, null, 2), "utf8");
console.log("Wrote", outPath);
console.log("Issued", attestations.length, "anchors. Use with Boxer: --anchors", outPath);
