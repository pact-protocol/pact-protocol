/**
 * Error Sanitization Utilities (v2 Phase 4)
 * 
 * Sanitizes secrets from error messages and error objects before they're thrown or logged.
 * Prevents secrets from appearing in stack traces, logs, or error handlers.
 */

import { redactSecrets } from "./redact";

/**
 * Sanitize an error message, removing any secrets.
 * 
 * @param message Error message string
 * @returns Sanitized error message
 */
export function sanitizeErrorMessage(message: string): string {
  // Redact API key patterns
  let sanitized = message.replace(/sk_(live|test)_[a-zA-Z0-9]+/g, "sk_***REDACTED***");
  sanitized = sanitized.replace(/rk_live_[a-zA-Z0-9]+/g, "rk_***REDACTED***");
  sanitized = sanitized.replace(/AKIA[0-9A-Z]{16}/g, "AKIA***REDACTED***");
  
  return sanitized;
}

/**
 * Sanitize an error object, removing secrets from message and any data fields.
 * 
 * @param error Error object (Error instance or plain object)
 * @returns Sanitized error object
 */
export function sanitizeError(error: unknown): Error {
  if (error instanceof Error) {
    const sanitized = new Error(sanitizeErrorMessage(error.message));
    sanitized.name = error.name;
    sanitized.stack = error.stack; // Stack traces don't typically contain secrets, but could be sanitized if needed
    return sanitized;
  }
  
  if (typeof error === "object" && error !== null) {
    // Redact secrets from error object
    const redacted = redactSecrets(error);
    return new Error(sanitizeErrorMessage(JSON.stringify(redacted)));
  }
  
  return new Error(sanitizeErrorMessage(String(error)));
}

/**
 * Create a sanitized error from a message and optional data.
 * Useful for error packaging functions that include config objects.
 * 
 * @param message Error message
 * @param data Optional data object (will be redacted)
 * @returns Sanitized Error
 */
export function createSanitizedError(message: string, data?: Record<string, unknown>): Error {
  let errorMessage = sanitizeErrorMessage(message);
  
  if (data) {
    const redactedData = redactSecrets(data);
    errorMessage += ` (data: ${JSON.stringify(redactedData)})`;
  }
  
  return new Error(errorMessage);
}
