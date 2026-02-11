/**
 * Regression: GET /v1/anchors/by-subject/:key must include revoked anchors
 * with revoked: true, revoked_at_ms, reason (not omit them).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { issue } from "../issue.js";
import {
  appendAnchor,
  appendRevocation,
  findAnchorsBySubject,
  readRevocations,
} from "../store.js";

function generateKeypair(): { publicKeyB58: string; secretKeyB58: string } {
  const kp = nacl.sign.keyPair();
  return {
    publicKeyB58: bs58.encode(Buffer.from(kp.publicKey)),
    secretKeyB58: bs58.encode(Buffer.from(kp.secretKey)),
  };
}

describe("by-subject includes revoked anchors", () => {
  const issuer = generateKeypair();
  const subjectPubkey = bs58.encode(Buffer.from(nacl.sign.keyPair().publicKey));
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "registry-by-subject-"));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("after issue + revoke, findAnchorsBySubject returns the anchor (not omitted)", () => {
    const att = issue(
      {
        subject_signer_public_key_b58: subjectPubkey,
        anchor_type: "platform_verified",
        verification_method: "stripe",
        payload: {
          platform: "stripe",
          account_type: "merchant",
          account_id_fingerprint: "sha256:" + "a".repeat(64),
          scope: ["payments"],
        },
        display_name: "Provider B (Stripe)",
      },
      issuer.publicKeyB58,
      issuer.secretKeyB58
    );

    appendAnchor(att, dataDir);
    let anchors = findAnchorsBySubject(subjectPubkey, dataDir);
    expect(anchors).toHaveLength(1);
    expect(anchors[0]!.anchor_id).toBe(att.anchor_id);

    appendRevocation(
      { anchor_id: att.anchor_id, revoked_at_ms: Date.now(), reason: "Compromised key" },
      dataDir
    );
    anchors = findAnchorsBySubject(subjectPubkey, dataDir);
    expect(anchors).toHaveLength(1);
    expect(anchors[0]!.anchor_id).toBe(att.anchor_id);
  });

  it("by-subject response shape: revoked anchor has revoked true, revoked_at_ms, reason", () => {
    const att = issue(
      {
        subject_signer_public_key_b58: subjectPubkey,
        anchor_type: "platform_verified",
        verification_method: "stripe",
        payload: {
          platform: "stripe",
          account_type: "merchant",
          account_id_fingerprint: "sha256:" + "b".repeat(64),
          scope: ["payments"],
        },
      },
      issuer.publicKeyB58,
      issuer.secretKeyB58
    );
    appendAnchor(att, dataDir);
    const revokedAtMs = 1700000000000;
    appendRevocation(
      { anchor_id: att.anchor_id, revoked_at_ms: revokedAtMs, reason: "Identity verification revoked after issuance" },
      dataDir
    );

    const anchors = findAnchorsBySubject(subjectPubkey, dataDir);
    const revocations = readRevocations(dataDir);
    const revocationByAnchorId = new Map(revocations.map((r) => [r.anchor_id, r]));

    const withRevocation = anchors.map((a) => {
      const rev = revocationByAnchorId.get(a.anchor_id);
      return {
        ...a,
        revoked: !!rev,
        ...(rev && { revoked_at_ms: rev.revoked_at_ms, reason: rev.reason }),
      };
    });
    withRevocation.sort((a, b) => (b.issued_at_ms ?? 0) - (a.issued_at_ms ?? 0));

    expect(withRevocation).toHaveLength(1);
    expect(withRevocation[0]).toMatchObject({
      anchor_id: att.anchor_id,
      revoked: true,
      revoked_at_ms: revokedAtMs,
      reason: "Identity verification revoked after issuance",
    });
  });
});
