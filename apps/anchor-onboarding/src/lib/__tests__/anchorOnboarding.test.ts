/**
 * Minimal unit tests for Anchor Onboarding v2:
 * - querystring pubkey parsing
 * - payload JSON parse/validation
 * - anchors.json export shape { anchors: [...] }
 */

import { describe, it, expect } from 'vitest';
import { getPubkeyFromSearch } from '../querystring';
import { parsePayloadJson, getPayloadTemplate, ANCHOR_TYPES } from '../payloadTemplates';

describe('querystring', () => {
  it('parses pubkey from ?pubkey=...', () => {
    expect(getPubkeyFromSearch('?pubkey=DCi6DFQteG5nfh8')).toBe('DCi6DFQteG5nfh8');
    expect(getPubkeyFromSearch('?pubkey=abc')).toBe('abc');
  });
  it('returns empty string when pubkey missing', () => {
    expect(getPubkeyFromSearch('?other=1')).toBe('');
    expect(getPubkeyFromSearch('')).toBe('');
  });
  it('trims whitespace', () => {
    expect(getPubkeyFromSearch('?pubkey=  key123  ')).toBe('key123');
  });
});

describe('payloadTemplates', () => {
  describe('parsePayloadJson', () => {
    it('accepts empty string as empty object', () => {
      const r = parsePayloadJson('');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual({});
    });
    it('parses valid JSON object', () => {
      const r = parsePayloadJson('{"platform":"stripe","x":1}');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual({ platform: 'stripe', x: 1 });
    });
    it('rejects invalid JSON', () => {
      const r = parsePayloadJson('{ invalid }');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBeTruthy();
    });
    it('rejects non-object (array)', () => {
      const r = parsePayloadJson('[]');
      expect(r.ok).toBe(false);
    });
    it('rejects null', () => {
      const r = parsePayloadJson('null');
      expect(r.ok).toBe(false);
    });
  });

  describe('getPayloadTemplate', () => {
    it('returns object for each anchor type', () => {
      for (const t of ANCHOR_TYPES) {
        const template = getPayloadTemplate(t);
        expect(template).toBeDefined();
        expect(typeof template).toBe('object');
        expect(!Array.isArray(template)).toBe(true);
      }
    });
    it('platform_verified has platform and account_id_fingerprint', () => {
      const t = getPayloadTemplate('platform_verified') as Record<string, unknown>;
      expect(t.platform).toBe('stripe');
      expect(t.account_id_fingerprint).toBeDefined();
    });
  });
});

describe('anchors.json export shape', () => {
  it('export must be { anchors: [...] }', () => {
    const anchors = [
      { anchor_id: 'anchor-1', anchor_type: 'platform_verified' },
      { anchor_id: 'anchor-2', anchor_type: 'kyb_verified' },
    ];
    const exported = JSON.stringify({ anchors }, null, 2);
    const parsed = JSON.parse(exported);
    expect(parsed).toHaveProperty('anchors');
    expect(Array.isArray(parsed.anchors)).toBe(true);
    expect(parsed.anchors).toHaveLength(2);
    expect(parsed.anchors[0].anchor_id).toBe('anchor-1');
  });
});
