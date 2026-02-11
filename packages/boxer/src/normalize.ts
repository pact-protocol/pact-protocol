/**
 * Domain mapping: map claim subject to domain_id for passport snapshot.
 * e.g. "art:authenticity:ArtworkX" -> "art:authenticity"; "api:weather:nyc" -> "api:weather".
 */

export const DOMAIN_PREFIX_ART_AUTHENTICITY = "art:authenticity";
export const DOMAIN_PREFIX_ART_PROVENANCE = "art:provenance";
export const DOMAIN_PREFIX_API_WEATHER = "api:weather";
export const DOMAIN_PREFIX_API_RELIABILITY = "api:reliability";

/**
 * Extract domain_id from a claim subject string.
 */
export function subjectToDomainId(subject: string | undefined): string | null {
  if (typeof subject !== "string" || !subject) return null;
  const s = subject.trim();
  if (s.startsWith("art:authenticity")) return DOMAIN_PREFIX_ART_AUTHENTICITY;
  if (s.startsWith("art:provenance")) return DOMAIN_PREFIX_ART_PROVENANCE;
  if (s.startsWith("api:weather")) return DOMAIN_PREFIX_API_WEATHER;
  if (s.startsWith("api:reliability")) return DOMAIN_PREFIX_API_RELIABILITY;
  return null;
}

/**
 * Collect unique domain_ids from transcript rounds (claims with subject) and from intent_type.
 */
export function extractDomainIdsFromTranscript(transcript: {
  intent_type?: string;
  rounds?: Array<{ content_summary?: { claims?: Array<{ subject?: string }> }; round_type?: string }>;
}): string[] {
  const ids = new Set<string>();
  for (const round of transcript.rounds ?? []) {
    const claims = round.content_summary?.claims;
    if (Array.isArray(claims)) {
      for (const c of claims) {
        const d = subjectToDomainId(c.subject);
        if (d) ids.add(d);
      }
    }
  }
  if (transcript.intent_type === "api.procurement") {
    ids.add(DOMAIN_PREFIX_API_RELIABILITY);
    ids.add(DOMAIN_PREFIX_API_WEATHER);
  }
  return [...ids].sort();
}
