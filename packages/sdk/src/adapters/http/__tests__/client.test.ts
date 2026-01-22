import { describe, it, expect, afterEach } from "vitest";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { startProviderServer } from "@pact/provider-adapter";
import { fetchQuote, fetchCommit, fetchReveal, fetchStreamChunk } from "../client";
import { verifyEnvelope, parseEnvelope } from "../../../protocol/envelope";
import type { ProviderQuoteRequest, CommitRequest, RevealRequest, StreamChunkRequest } from "../types";

describe("HTTP Client", () => {
  let server: { url: string; close(): void } | null = null;

  afterEach(() => {
    if (server) {
      server.close();
      server = null;
    }
  });

  it("should fetch quote from provider server and return signed envelope", async () => {
    const keyPair = nacl.sign.keyPair();
    const sellerId = bs58.encode(Buffer.from(keyPair.publicKey));
    
    server = startProviderServer({
      port: 0,
      sellerKeyPair: keyPair,
      sellerId,
    });
    
    const quoteReq: ProviderQuoteRequest = {
      intent_id: "test-intent-1",
      intent_type: "weather.data",
      max_price: 0.0001,
      constraints: {
        latency_ms: 50,
        freshness_sec: 10,
      },
    };
    
    const response = await fetchQuote(server.url, quoteReq);
    expect(response.envelope).toBeDefined();
    expect(response.envelope.message.type).toBe("ASK");
    expect(response.envelope.signer_public_key_b58).toBe(sellerId);
    
    // Verify envelope signature
    expect(verifyEnvelope(response.envelope)).toBe(true);
    
    // Parse and verify
    const parsed = await parseEnvelope(response.envelope);
    expect(parsed.message.type).toBe("ASK");
    expect(parsed.message.price).toBeLessThanOrEqual(quoteReq.max_price);
  });

  it("should fetch commit from provider server and return signed envelope", async () => {
    const keyPair = nacl.sign.keyPair();
    const sellerId = bs58.encode(Buffer.from(keyPair.publicKey));
    
    server = startProviderServer({
      port: 0,
      sellerKeyPair: keyPair,
      sellerId,
    });
    
    const payloadB64 = Buffer.from("test payload").toString("base64");
    const nonceB64 = Buffer.from("test nonce").toString("base64");
    
    const commitReq: CommitRequest = {
      intent_id: "test-intent-2",
      payload_b64: payloadB64,
      nonce_b64: nonceB64,
    };
    
    const response = await fetchCommit(server.url, commitReq);
    expect(response.envelope).toBeDefined();
    expect(response.envelope.message.type).toBe("COMMIT");
    expect(response.envelope.signer_public_key_b58).toBe(sellerId);
    expect(response.envelope.message.commit_hash_hex).toBeDefined();
    expect(response.envelope.message.commit_hash_hex.length).toBe(64);
    
    // Verify envelope signature
    expect(verifyEnvelope(response.envelope)).toBe(true);
  });

  it("should fetch reveal from provider server (success) and return signed envelope", async () => {
    const keyPair = nacl.sign.keyPair();
    const sellerId = bs58.encode(Buffer.from(keyPair.publicKey));
    
    server = startProviderServer({
      port: 0,
      sellerKeyPair: keyPair,
      sellerId,
    });
    
    const payloadB64 = Buffer.from("test payload").toString("base64");
    const nonceB64 = Buffer.from("test nonce").toString("base64");
    
    // Get commit envelope first
    const commitReq: CommitRequest = {
      intent_id: "test-intent-3",
      payload_b64: payloadB64,
      nonce_b64: nonceB64,
    };
    const commitResponse = await fetchCommit(server.url, commitReq);
    
    // Reveal with matching hash
    const revealReq: RevealRequest = {
      intent_id: "test-intent-3",
      payload_b64: payloadB64,
      nonce_b64: nonceB64,
      commit_hash_hex: commitResponse.envelope.message.commit_hash_hex,
    };
    
    const revealResponse = await fetchReveal(server.url, revealReq);
    expect(revealResponse.envelope).toBeDefined();
    expect(revealResponse.envelope.message.type).toBe("REVEAL");
    expect(revealResponse.envelope.signer_public_key_b58).toBe(sellerId);
    expect(verifyEnvelope(revealResponse.envelope)).toBe(true);
    expect(revealResponse.ok).toBe(true);
  });

  it("should fetch reveal from provider server (failure) and still return signed envelope", async () => {
    const keyPair = nacl.sign.keyPair();
    const sellerId = bs58.encode(Buffer.from(keyPair.publicKey));
    
    server = startProviderServer({
      port: 0,
      sellerKeyPair: keyPair,
      sellerId,
    });
    
    const payloadB64 = Buffer.from("test payload").toString("base64");
    const wrongPayloadB64 = Buffer.from("wrong payload").toString("base64");
    const nonceB64 = Buffer.from("test nonce").toString("base64");
    
    // Get commit envelope for correct payload
    const commitReq: CommitRequest = {
      intent_id: "test-intent-4",
      payload_b64: payloadB64,
      nonce_b64: nonceB64,
    };
    const commitResponse = await fetchCommit(server.url, commitReq);
    
    // Reveal with wrong payload
    const revealReq: RevealRequest = {
      intent_id: "test-intent-4",
      payload_b64: wrongPayloadB64,
      nonce_b64: nonceB64,
      commit_hash_hex: commitResponse.envelope.message.commit_hash_hex,
    };
    
    const revealResponse = await fetchReveal(server.url, revealReq);
    expect(revealResponse.envelope).toBeDefined();
    expect(revealResponse.envelope.message.type).toBe("REVEAL");
    expect(revealResponse.envelope.signer_public_key_b58).toBe(sellerId);
    // Envelope should still verify (properly signed)
    expect(verifyEnvelope(revealResponse.envelope)).toBe(true);
    // But ok should be false due to hash mismatch
    expect(revealResponse.ok).toBe(false);
    expect(revealResponse.code).toBe("FAILED_PROOF");
  });

  it("should fetch stream chunk from provider server and return signed envelope", async () => {
    const keyPair = nacl.sign.keyPair();
    const sellerId = bs58.encode(Buffer.from(keyPair.publicKey));
    
    server = startProviderServer({
      port: 0,
      sellerKeyPair: keyPair,
      sellerId,
    });
    
    const chunkReq: StreamChunkRequest = {
      intent_id: "test-intent-5",
      seq: 0,
    };
    
    const response = await fetchStreamChunk(server.url, chunkReq);
    expect(response.envelope).toBeDefined();
    expect(response.envelope.message.type).toBe("STREAM_CHUNK");
    expect(response.envelope.message.intent_id).toBe(chunkReq.intent_id);
    expect(response.envelope.message.seq).toBe(0);
    expect(response.envelope.signer_public_key_b58).toBe(sellerId);
    
    // Verify envelope signature
    expect(verifyEnvelope(response.envelope)).toBe(true);
    
    // Parse and verify
    const parsed = await parseEnvelope(response.envelope);
    expect(parsed.message.type).toBe("STREAM_CHUNK");
    expect(parsed.message.seq).toBe(0);
  });
});

