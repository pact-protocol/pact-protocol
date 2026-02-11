/**
 * Parse pubkey from a query string (?pubkey=...).
 * Used for Evidence Viewer deep-link. Testable without window.
 */
export function getPubkeyFromSearch(search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return params.get('pubkey')?.trim() ?? '';
}

/**
 * Parse pubkey from current URL (uses window.location.search).
 */
export function getPubkeyFromQuery(): string {
  if (typeof window === 'undefined') return '';
  return getPubkeyFromSearch(window.location.search);
}
