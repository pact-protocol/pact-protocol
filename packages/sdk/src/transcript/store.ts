/**
 * Transcript Store
 * 
 * Writes audit/debug transcripts to disk.
 */

import * as fs from "fs";
import * as path from "path";

export class TranscriptStore {
  private baseDir: string;

  constructor(baseDir?: string) {
    // Check for PACT_TRANSCRIPT_DIR env var first, then use provided baseDir, then default
    this.baseDir = baseDir || process.env.PACT_TRANSCRIPT_DIR || path.join(process.cwd(), ".pact", "transcripts");
  }

  /**
   * Write a transcript to disk.
   * @param intentId The intent ID (used as filename)
   * @param transcript The transcript data
   * @param customDir Optional custom directory (overrides baseDir)
   * @returns The path where the transcript was written
   */
  async writeTranscript(
    intentId: string,
    transcript: any,
    customDir?: string
  ): Promise<string> {
    const targetDir = customDir || this.baseDir;
    
    // Ensure directory exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    // Sanitize intentId for filename (remove invalid chars)
    const sanitizedId = intentId.replace(/[^a-zA-Z0-9_-]/g, "_");
    
    // Include timestamp in filename for uniqueness
    // Use transcript.timestamp_ms if available, otherwise use current time
    const timestamp = transcript?.timestamp_ms || Date.now();
    const timestampStr = new Date(timestamp).toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, -5); // Format: 2024-01-15_14-30-45
    
    const filename = `${sanitizedId}_${timestampStr}.json`;
    const filepath = path.join(targetDir, filename);
    
    // Write pretty JSON
    fs.writeFileSync(
      filepath,
      JSON.stringify(transcript, null, 2),
      "utf-8"
    );
    
    return filepath;
  }
}

