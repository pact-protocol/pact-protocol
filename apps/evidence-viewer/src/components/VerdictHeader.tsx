import type { GCView, Judgment, AuditorPackData } from '../types';
import { getIntegrityVerdict, getIntegrityVerdictLabel } from '../lib/integrityVerdict';
import { badgeToneToCssClass, getIntegrityBadgeStyle, getResponsibilityBadgeStyle } from '../lib/badgeSemantics';

interface VerdictHeaderProps {
  gcView: GCView;
  judgment: Judgment;
  packData: AuditorPackData;
}

export default function VerdictHeader({ gcView, judgment, packData }: VerdictHeaderProps) {
  const verdict = getIntegrityVerdict(packData);
  const isVerified = verdict.verdict === 'VERIFIED';
  const faultDomain = isVerified
    ? (judgment?.dblDetermination ?? gcView.responsibility?.judgment?.fault_domain ?? '—')
    : 'Unavailable (untrusted evidence)';
  const confidence = Math.round((judgment?.confidence ?? gcView.responsibility?.judgment?.confidence ?? 0) * 100);

  const judgmentClass = badgeToneToCssClass(getResponsibilityBadgeStyle(isVerified ? (judgment?.dblDetermination ?? gcView.responsibility?.judgment?.fault_domain ?? null) : 'UNAVAILABLE'));

  // "Integrity check failed" only when NOT VERIFIED. Never when integrity is VERIFIED.
  const verificationSubtext =
    verdict.verdict === 'VERIFIED'
      ? 'Checksums, hash-chain, and signatures verified.'
      : 'Integrity check failed. Do not trust this pack.';

  const integrityClass = badgeToneToCssClass(getIntegrityBadgeStyle(verdict.verdict));

  const es = gcView?.executive_summary;
  const whatHappenedOneLiner = !isVerified
    ? 'Outcome unavailable (untrusted evidence).'
    : es
      ? `${es.status} — Money moved: ${es.money_moved ? 'YES' : 'NO'} — Settlement attempted: ${es.settlement_attempted ? 'YES' : 'NO'}`
      : '—';

  return (
    <div className="verdict-header">
      <div className="verdict-strip">
        <span className="verdict-label">Integrity</span>
        <span className={integrityClass}>
          {getIntegrityVerdictLabel(verdict.verdict)}
        </span>
        <span className="verdict-sep">|</span>
        <span className="verdict-label">Judgment</span>
        <span className={`verdict-fault ${judgmentClass}`}>{faultDomain}</span>
        <span className="verdict-sep">|</span>
        <span className="verdict-label">Confidence</span>
        <span>{confidence}%</span>
      </div>
      <p className="verdict-what-happened">{whatHappenedOneLiner}</p>
      <p className="verdict-verification-subtext">{verificationSubtext}</p>
    </div>
  );
}
