/**
 * Provider Server - Development/Demo Only
 * 
 * ⚠️  DEV-ONLY IDENTITY: This server uses a deterministic keypair derived from
 *     a fixed seed string for development and testing convenience.
 * 
 *     The default seed "pact-provider-default-seed-v1" produces the same
 *     sellerId across restarts, allowing registry entries to remain valid
 *     during development.
 * 
 * ⚠️  NOT FOR PRODUCTION: This deterministic identity is NOT suitable for
 *     production use. Production providers MUST:
 *     - Use cryptographically secure random keypairs
 *     - Store keypairs securely (hardware security modules, key management systems)
 *     - Never use predictable or hardcoded seeds
 *     - Follow proper KYA (Know Your Agent) identity management practices
 * 
 *     Deterministic identities violate security best practices and should
 *     never be used in environments where identity verification matters.
 */

import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Keypair } from "@pact/sdk";
import { handleQuote, handleCommit, handleReveal, handleStreamChunk } from "./handlers";
import type {
  ProviderQuoteRequest,
  CommitRequest,
  RevealRequest,
  StreamChunkRequest,
} from "./types";

export interface ProviderServerOptions {
  port?: number; // 0 for random port
  sellerKeyPair: Keypair;
  sellerId: string; // pubkey b58
  baseline_latency_ms?: number;
}

export interface ProviderServer {
  url: string;
  close(): void;
}

export function startProviderServer(
  opts: ProviderServerOptions
): ProviderServer {
  const { port = 0, sellerId, sellerKeyPair } = opts;
  
  // Create deterministic clock function
  let now = 1000;
  const nowMs = () => {
    const current = now;
    now += 1000;
    return current;
  };

  const server = http.createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      // CORS headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
      }

      // Health check
      if (req.method === "GET" && req.url === "/health") {
        const sellerPubkeyB58 = sellerId; // sellerId is already pubkey b58
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, sellerId, seller_pubkey_b58: sellerPubkeyB58 }));
        return;
      }

      // All other routes require POST
      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Method not allowed" }));
        return;
      }

      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });

      req.on("end", async () => {
        try {
          if (req.url === "/quote") {
            const quoteReq: ProviderQuoteRequest = JSON.parse(body);
            const response = await handleQuote(quoteReq, sellerKeyPair, nowMs);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(response));
          } else if (req.url === "/commit") {
            const commitReq: CommitRequest = JSON.parse(body);
            const response = await handleCommit(commitReq, sellerKeyPair, nowMs);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(response));
          } else if (req.url === "/reveal") {
            const revealReq: RevealRequest = JSON.parse(body);
            const response = await handleReveal(revealReq, sellerKeyPair, nowMs);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(response));
          } else if (req.url === "/stream/chunk") {
            const chunkReq: StreamChunkRequest = JSON.parse(body);
            const response = await handleStreamChunk(chunkReq, sellerKeyPair, nowMs);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(response));
          } else {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Not found" }));
          }
        } catch (error: any) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: error.message || "Bad request",
            })
          );
        }
      });
    }
  );

  server.listen(port, () => {
    // Server started
  });

  // Use the port we know directly - this avoids the timing issue
  // Only fall back to address() if port was 0 (random port)
  const actualPort = port !== 0 ? port : (server.address() as { port: number } | null)?.port;

  if (actualPort === undefined) {
    throw new Error("Failed to get server port. If using random port (0), ensure server has started.");
  }

  const url = `http://127.0.0.1:${actualPort}`;

  return {
    url,
    close() {
      server.close();
    },
  };
}

// Main entry point when run directly
if (process.argv[1]?.includes("server.ts")) {
  const nacl = await import("tweetnacl");
  const bs58 = await import("bs58");
  const minimist = await import("minimist");
  const { createHash } = await import("node:crypto");
  
  const raw = process.argv.slice(2).filter((x) => x !== "--");
  const args = minimist.default(raw, {
    string: ["seed"],
    alias: { p: "port", s: "seed" },
  });

  const port = typeof args.port === "number" ? args.port : (args.port ? parseInt(String(args.port), 10) : 7777);
  
  // ⚠️  DEV-ONLY: Deterministic keypair generation for development/testing
  //     This is NOT suitable for production use. See file-level comment above.
  const seed = args.seed || "pact-provider-default-seed-v1";
  const seedHash = createHash("sha256").update(seed).digest(); // 32 bytes
  
  // Generate deterministic keypair from seed
  // Same seed → same keypair → same sellerId every run
  const keyPair = nacl.default.sign.keyPair.fromSeed(seedHash);
  
  const sellerId = bs58.default.encode(Buffer.from(keyPair.publicKey));

  const server = startProviderServer({
    port,
    sellerKeyPair: keyPair,
    sellerId,
  });

  const url = `http://127.0.0.1:${port}`;
  console.log(`[Provider Server] sellerId: ${sellerId}`);
  console.log(`[Provider Server] Started on ${url}`);
  console.log(`[Provider Server] ⚠️  WARNING: Using DEV-ONLY deterministic identity (NOT for production)`);
  console.log(`[Provider Server] Press Ctrl+C to stop`);
}

