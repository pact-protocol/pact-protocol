#!/usr/bin/env node
/**
 * Generate Ed25519 keypair for Pact Registry issuer (dev).
 * Writes .env.registry and prints path. Use: node scripts/gen_registry_keys.mjs then node scripts/issue_demo_anchors.mjs (loads .env.registry).
 */

import nacl from "tweetnacl";
import bs58 from "bs58";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = join(__dirname, "..");

const keypair = nacl.sign.keyPair();
const publicKeyB58 = bs58.encode(Buffer.from(keypair.publicKey));
const secretKeyB58 = bs58.encode(Buffer.from(keypair.secretKey));

const envContent = `REGISTRY_ISSUER_PUBLIC_KEY_B58=${publicKeyB58}
REGISTRY_ISSUER_SECRET_KEY_B58=${secretKeyB58}
REGISTRY_API_KEY=dev-api-key
`;
const envPath = join(repoRoot, ".env.registry");
writeFileSync(envPath, envContent, "utf8");
console.log("Wrote", envPath);
console.log("Run: node scripts/issue_demo_anchors.mjs (script loads .env.registry)");
