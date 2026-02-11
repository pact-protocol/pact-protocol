/**
 * Optional online revocation check (warn only, offline-first).
 */

export interface RevocationStatus {
  revoked: boolean;
  revoked_at_ms?: number;
  reason?: string;
}

export async function fetchRevocationStatus(
  registryBaseUrl: string,
  anchorId: string
): Promise<RevocationStatus> {
  const url = `${registryBaseUrl.replace(/\/$/, "")}/v1/revocations/${encodeURIComponent(anchorId)}`;
  const res = await fetch(url);
  if (!res.ok) return { revoked: false };
  const data = (await res.json()) as RevocationStatus;
  return data;
}
