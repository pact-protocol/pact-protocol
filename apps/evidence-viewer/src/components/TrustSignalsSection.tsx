import { useMemo } from 'react';
import type { PassportSnapshotView } from '../types';

interface TrustSignalsSectionProps {
  /** Trust snapshot (passport snapshot). No identity data is rendered from this. */
  boxerSnapshot?: PassportSnapshotView | null;
  /** Forward-looking next-action recommendations only (e.g. "Allow future transactions", "Require escalation"). */
  recommendations?: string[];
  /** When true, evidence integrity is INVALID or TAMPERED; show advisory-only warning. */
  isEvidenceUntrusted?: boolean;
}

/**
 * Derive a single aggregate reliability score from the snapshot without exposing identity.
 * Uses the minimum reliability across all entities' first domain so policy floor is visible.
 */
function aggregateReliability(snapshot: PassportSnapshotView | null | undefined): number | null {
  if (!snapshot?.entities?.length) return null;
  let min: number | null = null;
  for (const e of snapshot.entities) {
    const score = e.domains?.[0]?.metrics?.reliability_score;
    if (typeof score === 'number') {
      min = min == null ? score : Math.min(min, score);
    }
  }
  return min;
}

/**
 * Derive the set of attestation/gate types required in the snapshot (e.g. KYB, Domain).
 * No entity IDs or pubkeys — only the set of gate types.
 */
function activeGateTypes(snapshot: PassportSnapshotView | null | undefined): string[] {
  if (!snapshot?.entities?.length) return [];
  const set = new Set<string>();
  for (const e of snapshot.entities) {
    for (const a of e.anchors ?? []) {
      const t = (a.type ?? '').toLowerCase();
      const method = (a.verification_method ?? '').toLowerCase();
      if (t.includes('kyb')) set.add('KYB');
      else if (t.includes('credential')) set.add('Credential');
      else if (t.includes('domain')) set.add('Domain');
      else if (t.includes('platform') && method === 'stripe') set.add('Stripe Verified');
      else if (t.includes('cross') || t.includes('platform')) set.add('Cross-platform');
      else if (a.type) set.add(a.type);
    }
  }
  return Array.from(set).sort();
}

/**
 * Trust Signals: STRICT SEMANTIC BOUNDARY — future behavior only.
 * Must NOT describe or restate: transaction outcome, responsibility/fault, evidence integrity, settlement results.
 * Allowed: reliability (aggregate), active trust gates, next-action recommendations.
 * No identity, no passport data, no transaction history.
 */
function hasAnyRevokedAnchor(snapshot: PassportSnapshotView | null | undefined): boolean {
  if (!snapshot?.entities?.length) return false;
  return snapshot.entities.some((e) => e.anchors?.some((a) => a.revoked === true));
}

export default function TrustSignalsSection({ boxerSnapshot, recommendations = [], isEvidenceUntrusted = false }: TrustSignalsSectionProps) {
  const reliability = useMemo(() => aggregateReliability(boxerSnapshot), [boxerSnapshot]);
  const gateTypes = useMemo(() => activeGateTypes(boxerSnapshot), [boxerSnapshot]);
  const anyRevoked = useMemo(() => hasAnyRevokedAnchor(boxerSnapshot), [boxerSnapshot]);
  const pct = reliability != null ? (reliability <= 1 ? Math.round(reliability * 100) : Math.min(100, Math.max(0, reliability))) : null;

  return (
    <div className="trust-signals-section panel">
      {anyRevoked && (
        <>
          <p className="trust-signals-untrusted-warning" role="alert">
            Warning: Identity attestation revoked. Evidence remains valid; trust signals may be downgraded.
          </p>
          <p className="trust-signals-future-not-recommended" role="status">
            Future use not recommended.
          </p>
        </>
      )}
      {isEvidenceUntrusted && (
        <p className="trust-signals-untrusted-warning" role="alert">
          Trust guidance shown despite untrusted evidence. Recommendations are advisory only.
        </p>
      )}
      <p className="trust-signals-disclaimer">
        Trust signals are forward-looking recommendations. They do not describe what happened in this transaction.
      </p>

      {reliability != null && (
        <div className="trust-signals-block">
          <span className="trust-signals-label">Reliability</span>
          <div className="trust-signals-bar-wrap" role="progressbar" aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label={`Reliability ${pct ?? 0} out of 100`}>
            <div className="trust-signals-bar-track">
              <div className="trust-signals-bar-fill" style={{ width: `${pct ?? 0}%` }} />
            </div>
            <span className="trust-signals-bar-value">{pct != null ? `${pct}/100` : '—'}</span>
          </div>
        </div>
      )}

      {gateTypes.length > 0 && (
        <div className="trust-signals-block">
          <span className="trust-signals-label">Active trust gates</span>
          <p className="trust-signals-gates">
            Required attestations: {gateTypes.join(', ')}
          </p>
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="trust-signals-block">
          <span className="trust-signals-label">Next-action recommendations</span>
          <ul className="trust-signals-recommendations">
            {recommendations.map((rec, i) => (
              <li key={i}>{rec}</li>
            ))}
          </ul>
        </div>
      )}

      {reliability == null && gateTypes.length === 0 && recommendations.length === 0 && (
        <p className="trust-signals-muted">No trust signals available. Load a trust snapshot and ensure the pack provides forward-looking recommendations.</p>
      )}
    </div>
  );
}
