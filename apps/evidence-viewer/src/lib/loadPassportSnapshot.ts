/**
 * Load and validate a passport/Boxer snapshot from a JSON file (e.g. passport_v0_3.json).
 * UI wiring only; no backend.
 */

import type { PassportSnapshotView } from '../types';

export class PassportSnapshotLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PassportSnapshotLoadError';
  }
}

/**
 * Parse and validate JSON as a PassportSnapshotView.
 * Accepts passport_v0_*.json shape: object with optional version, scoring_version, entities (array).
 */
export function parsePassportSnapshotJson(jsonText: string): PassportSnapshotView {
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch (e) {
    throw new PassportSnapshotLoadError('Invalid JSON');
  }
  if (data == null || typeof data !== 'object') {
    throw new PassportSnapshotLoadError('Snapshot must be a JSON object');
  }
  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.entities) && obj.entities.length > 0) {
    // Validate first entity has expected shape (loose)
    const first = obj.entities[0] as Record<string, unknown>;
    if (first != null && typeof first !== 'object') {
      throw new PassportSnapshotLoadError('Snapshot entities must be objects');
    }
  }
  return data as PassportSnapshotView;
}

/**
 * Load snapshot from a File (e.g. from file picker).
 */
export async function loadPassportSnapshotFromFile(file: File): Promise<PassportSnapshotView> {
  const text = await file.text();
  return parsePassportSnapshotJson(text);
}

/** Match passport_v0_*.json for accept attribute. */
export const PASSPORT_SNAPSHOT_ACCEPT = '.json,application/json';
