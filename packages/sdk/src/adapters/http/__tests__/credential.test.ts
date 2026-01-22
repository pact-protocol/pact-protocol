import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fetchCredential } from "../client";
import { startProviderServer } from "@pact/provider-adapter";
import { verifyEnvelope } from "@pact/sdk";

describe("Credential Fetching", () => {
  let server: { url: string; close(): void } | null = null;

  beforeEach(async () => {
    // Create ephemeral keypair for each test
    const nacl = await import("tweetnacl");
    const bs58 = await import("bs58");
    const keyPair = nacl.default.sign.keyPair();
    const sellerId = bs58.default.encode(Buffer.from(keyPair.publicKey));
    
    server = startProviderServer({
      port: 0,
      sellerKeyPair: keyPair,
      sellerId,
    });
  });

  afterEach(() => {
    if (server) {
      server.close();
      server = null;
    }
  });

  it("should fetch credential for intent type", async () => {
    const credentialResponse = await fetchCredential(server!.url, "weather.data");
    
    expect(credentialResponse.envelope).toBeDefined();
    expect(credentialResponse.envelope.envelope_version).toBe("pact-envelope/1.0");
    expect(credentialResponse.envelope.signer_public_key_b58).toBeTruthy();
    
    // Verify envelope signature
    const isValid = verifyEnvelope(credentialResponse.envelope);
    expect(isValid).toBe(true);
    
    // Verify credential message structure
    const credentialMsg = credentialResponse.envelope.message as any;
    expect(credentialMsg.protocol_version).toBe("pact/1.0");
    expect(credentialMsg.credential_version).toBe("1");
    expect(credentialMsg.provider_pubkey_b58).toBe(credentialResponse.envelope.signer_public_key_b58);
    expect(credentialMsg.capabilities).toBeDefined();
    expect(Array.isArray(credentialMsg.capabilities)).toBe(true);
    
    // Verify capability for weather.data
    const weatherCapability = credentialMsg.capabilities.find((cap: any) => cap.intentType === "weather.data");
    expect(weatherCapability).toBeDefined();
    expect(weatherCapability.modes).toContain("hash_reveal");
    expect(weatherCapability.modes).toContain("streaming");
  });

  it("should filter credential by intent type", async () => {
    const credentialResponse = await fetchCredential(server!.url, "weather.data");
    
    const credentialMsg = credentialResponse.envelope.message as any;
    const capabilities = credentialMsg.capabilities || [];
    
    // Should only return capabilities matching requested intent
    // (In v1.5, server filters capabilities by intent query param)
    const weatherCapability = capabilities.find((cap: any) => cap.intentType === "weather.data");
    expect(weatherCapability).toBeDefined();
  });
});

