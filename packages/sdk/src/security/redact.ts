/**
 * Secret Redaction Utilities (v2 Phase 4)
 * 
 * Deep redaction of secrets from objects and transcript validation.
 * Prevents secrets from appearing in logs, transcripts, or error messages.
 */

/**
 * Secret field patterns (case-insensitive).
 * Any key containing these substrings will be redacted.
 * 
 * Note: "key" is excluded to avoid redacting "public_key" and other safe keys.
 * Only specific secret-related patterns are matched.
 */
const SECRET_PATTERNS = [
  "secret",
  "private",
  "seed",
  "mnemonic",
  "api_key",
  "apikey",
  "token",
  "passphrase",
  "password",
  "pwd",
];

/**
 * Check if a key name likely contains a secret.
 */
function isSecretKey(key: string): boolean {
  const keyLower = key.toLowerCase();
  return SECRET_PATTERNS.some(pattern => keyLower.includes(pattern));
}

/**
 * Deep redact secrets from an object.
 * 
 * Recursively traverses objects and arrays, replacing values of keys
 * that match secret patterns with "[REDACTED]".
 * 
 * @param obj - Object to redact
 * @returns Redacted copy of the object (original is not modified)
 */
export function redactSecrets(obj: unknown): unknown {
  // Handle null/undefined
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  // Handle primitives (strings, numbers, booleans)
  if (typeof obj !== "object") {
    return obj;
  }
  
  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => redactSecrets(item));
  }
  
  // Handle objects
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isSecretKey(key)) {
      // Redact the value
      redacted[key] = "[REDACTED]";
    } else {
      // Recursively redact nested objects
      redacted[key] = redactSecrets(value);
    }
  }
  
  return redacted;
}

/**
 * Assert that a transcript contains no secrets.
 * 
 * Deep-scans the transcript object for secret patterns and returns
 * an error if any are found.
 * 
 * @param transcript - Transcript object to validate
 * @returns Validation result
 */
export function assertNoSecretsInTranscript(
  transcript: unknown
): { ok: true } | { ok: false; reason: string } {
  // Redact the transcript
  const redacted = redactSecrets(transcript);
  
  // Serialize both to JSON for comparison
  const originalJson = JSON.stringify(transcript);
  const redactedJson = JSON.stringify(redacted);
  
  // If they differ, secrets were found
  if (originalJson !== redactedJson) {
    // Find which keys were redacted
    const original = transcript as Record<string, unknown>;
    const redactedObj = redacted as Record<string, unknown>;
    const redactedKeys: string[] = [];
    
    function findRedactedKeys(obj: unknown, redacted: unknown, path: string = ""): void {
      if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
        return;
      }
      if (typeof redacted !== "object" || redacted === null || Array.isArray(redacted)) {
        return;
      }
      
      const objRecord = obj as Record<string, unknown>;
      const redactedRecord = redacted as Record<string, unknown>;
      
      for (const key of Object.keys(objRecord)) {
        const currentPath = path ? `${path}.${key}` : key;
        
        if (redactedRecord[key] === "[REDACTED]" && objRecord[key] !== "[REDACTED]") {
          redactedKeys.push(currentPath);
        } else if (typeof objRecord[key] === "object" && objRecord[key] !== null) {
          findRedactedKeys(objRecord[key], redactedRecord[key], currentPath);
        }
      }
    }
    
    findRedactedKeys(transcript, redacted);
    
    return {
      ok: false,
      reason: `Transcript contains secrets at: ${redactedKeys.join(", ")}`,
    };
  }
  
  return { ok: true };
}
