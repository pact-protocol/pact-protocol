import type { Judgment, GCView } from '../types';
import type { IntegrityVerdictKind } from '../lib/integrityVerdict';
import PartyChip from './PartyChip';

interface ResponsibilityPanelProps {
  judgment: Judgment;
  gcView: GCView;
  integrityVerdict: IntegrityVerdictKind;
  onOpenParty?: (pubkey: string) => void;
}

function truncate(s: string, len = 16): string {
  return s.length <= len ? s : s.slice(0, len) + '...';
}

const RESPONSIBILITY_DISCLAIMER = 'Unavailable (untrusted evidence).';

export default function ResponsibilityPanel({ judgment, gcView, integrityVerdict, onOpenParty }: ResponsibilityPanelProps) {
  const isUntrusted = integrityVerdict !== 'VERIFIED';

  if (isUntrusted) {
    return (
      <div className="responsibility-panel panel">
        <h3>Responsibility</h3>
        <p className="responsibility-disclaimer">{RESPONSIBILITY_DISCLAIMER}</p>
      </div>
    );
  }

  const resp = gcView.responsibility;
  const faultDomain = judgment?.dblDetermination ?? resp?.judgment?.fault_domain ?? '—';
  const requiredActor = judgment?.requiredNextActor ?? '—';
  const requiredAction = judgment?.requiredAction ?? '—';
  const terminal = judgment?.terminal ?? resp?.judgment?.terminal ?? false;
  const confidence = (judgment?.confidence ?? resp?.judgment?.confidence ?? 0) * 100;
  const lvsh = resp?.last_valid_signed_hash ?? '—';
  const blameExplanation = resp?.blame_explanation ?? '—';
  const responsiblePubkey = judgment?.responsible_signer_pubkey ?? resp?.judgment?.responsible_signer_pubkey;

  return (
    <div className="responsibility-panel panel">
      <h3>Responsibility</h3>
      <dl className="case-meta">
        <dt>Fault Domain</dt>
        <dd>
          <span className="badge">{faultDomain}</span>
        </dd>
        {responsiblePubkey && (
          <>
            <dt>Responsible party</dt>
            <dd>
              {onOpenParty ? (
                <PartyChip pubkey={responsiblePubkey} onOpenParty={onOpenParty} truncateLen={16} />
              ) : (
                <code title={responsiblePubkey}>{truncate(responsiblePubkey, 24)}</code>
              )}
            </dd>
          </>
        )}
        <dt>Required Next Actor</dt>
        <dd>{requiredActor}</dd>
        <dt>Required Action</dt>
        <dd>{requiredAction}</dd>
        <dt>Terminal</dt>
        <dd>{terminal ? 'Yes' : 'No'}</dd>
        <dt>Confidence</dt>
        <dd>
          <div className="confidence-bar">
            <div className="confidence-fill" style={{ width: `${confidence}%` }} />
            <span>{Math.round(confidence)}%</span>
          </div>
        </dd>
        <dt>Last Valid Signed Hash</dt>
        <dd>
          <code title={lvsh}>{truncate(lvsh, 24)}</code>
        </dd>
        <dt>Blame Explanation</dt>
        <dd>
          <p>{blameExplanation}</p>
        </dd>
      </dl>
    </div>
  );
}
