/**
 * Transcript Tests
 * 
 * Tests for transcript saving functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { TranscriptStore } from "../../transcript/store";
import type { TranscriptV1 } from "../../transcript/types";

describe("transcript", () => {
  describe("TranscriptStore", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pact-transcript-test-"));
    });

    afterEach(() => {
      // Clean up temp directory
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("writes transcript to default directory", async () => {
      const store = new TranscriptStore(tempDir);
      const transcript: TranscriptV1 = {
        version: "1",
        intent_id: "test-intent-123",
        intent_type: "weather.data",
        timestamp_ms: Date.now(),
        input: {
          intentType: "weather.data",
          scope: "NYC",
          constraints: { latency_ms: 50, freshness_sec: 10 },
          maxPrice: 0.0001,
        },
        directory: [],
        credential_checks: [],
        quotes: [],
        outcome: { ok: true },
      };

      const filepath = await store.writeTranscript("test-intent-123", transcript);
      
      // Filename should include timestamp for uniqueness
      expect(filepath).toMatch(/test-intent-123_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/);
      expect(fs.existsSync(filepath)).toBe(true);
      
      const content = fs.readFileSync(filepath, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed.version).toBe("1");
      expect(parsed.intent_id).toBe("test-intent-123");
      expect(parsed.intent_type).toBe("weather.data");
    });

    it("creates directory if it doesn't exist", async () => {
      const customDir = path.join(tempDir, "custom", "transcripts");
      const store = new TranscriptStore(customDir);
      const transcript: TranscriptV1 = {
        version: "1",
        intent_id: "test-456",
        intent_type: "weather.data",
        timestamp_ms: Date.now(),
        input: {
          intentType: "weather.data",
          scope: "NYC",
          constraints: { latency_ms: 50, freshness_sec: 10 },
          maxPrice: 0.0001,
        },
        directory: [],
        credential_checks: [],
        quotes: [],
        outcome: { ok: true },
      };

      const filepath = await store.writeTranscript("test-456", transcript);
      
      expect(fs.existsSync(customDir)).toBe(true);
      expect(fs.existsSync(filepath)).toBe(true);
      // Filename should include timestamp
      expect(filepath).toMatch(/test-456_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/);
    });

    it("sanitizes intent_id for filename", async () => {
      const store = new TranscriptStore(tempDir);
      const transcript: TranscriptV1 = {
        version: "1",
        intent_id: "test/intent:with-invalid-chars",
        intent_type: "weather.data",
        timestamp_ms: Date.now(),
        input: {
          intentType: "weather.data",
          scope: "NYC",
          constraints: { latency_ms: 50, freshness_sec: 10 },
          maxPrice: 0.0001,
        },
        directory: [],
        credential_checks: [],
        quotes: [],
        outcome: { ok: true },
      };

      const filepath = await store.writeTranscript("test/intent:with-invalid-chars", transcript);
      
      // Should sanitize invalid chars and include timestamp
      expect(filepath).toMatch(/test_intent_with-invalid-chars_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/);
      expect(fs.existsSync(filepath)).toBe(true);
    });

    it("writes pretty JSON", async () => {
      const store = new TranscriptStore(tempDir);
      const transcript: TranscriptV1 = {
        version: "1",
        intent_id: "test-pretty",
        intent_type: "weather.data",
        timestamp_ms: Date.now(),
        input: {
          intentType: "weather.data",
          scope: "NYC",
          constraints: { latency_ms: 50, freshness_sec: 10 },
          maxPrice: 0.0001,
        },
        directory: [],
        credential_checks: [],
        quotes: [],
        outcome: { ok: true },
      };

      const filepath = await store.writeTranscript("test-pretty", transcript);
      const content = fs.readFileSync(filepath, "utf-8");
      
      // Should be pretty-printed (contains newlines and indentation)
      expect(content).toContain("\n");
      expect(content).toContain("  "); // Indentation
    });
  });
});

