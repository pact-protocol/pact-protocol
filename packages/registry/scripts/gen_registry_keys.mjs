#!/usr/bin/env node
/**
 * Generate Ed25519 keypair for Pact Registry issuer.
 * Uses same encoding as registry signing (tweetnacl + bs58).
 * Output is copy-pasteable into .env.registry or shell.
 */

import nacl from "tweetnacl";
import bs58 from "bs58";

const keypair = nacl.sign.keyPair();
const publicKeyB58 = bs58.encode(Buffer.from(keypair.publicKey));
const secretKeyB58 = bs58.encode(Buffer.from(keypair.secretKey));

console.log("REGISTRY_ISSUER_PUBLIC_KEY_B58=" + publicKeyB58);
console.log("REGISTRY_ISSUER_SECRET_KEY_B58=" + secretKeyB58);
