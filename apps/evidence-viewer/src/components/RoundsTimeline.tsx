import type { TranscriptRoundView, TranscriptView, ReplayVerifyResultView } from '../types';
import { truncateHash } from '../lib/loadPack';
import './Panel.css';
import './RoundsTimeline.css';

function parseTranscript(transcriptJson: string | undefined): TranscriptView | null {
  if (!transcriptJson?.trim()) return null;
  try {
    const parsed = JSON.parse(transcriptJson) as TranscriptView;
    return parsed?.rounds?.length ? parsed : null;
  } catch {
    return null;
  }
}

function getRoundSignerLabel(round: TranscriptRoundView): string {
  const pubkey = round.signature?.signer_public_key_b58 ?? round.public_key_b58;
  if (round.agent_id) return round.agent_id;
  if (pubkey) return truncateHash(pubkey, 12);
  return '—';
}

function hasPerRoundVerifierOutput(result: unknown): result is ReplayVerifyResultView {
  if (!result || typeof result !== 'object') return false;
  const r = result as ReplayVerifyResultView;
  return (
    typeof r.rounds_verified === 'number' ||
    (Array.isArray(r.errors) && r.errors.some((e) => e != null && typeof e === 'object'))
  );
}

function getRoundSignatureStatus(
  roundIndex: number,
  replay: ReplayVerifyResultView
): 'valid' | 'invalid' | null {
  const errors = replay.errors;
  if (!Array.isArray(errors)) {
    const n = replay.rounds_verified ?? 0;
    return roundIndex < n ? 'valid' : null;
  }
  const hasInvalid = errors.some(
    (e) =>
      e?.round_number === roundIndex &&
      (e.type === 'SIGNATURE_INVALID' || (e.message && /signature/i.test(e.message)))
  );
  if (hasInvalid) return 'invalid';
  const n = replay.rounds_verified ?? 0;
  return roundIndex < n ? 'valid' : null;
}

function getRoundHashLinkStatus(
  roundIndex: number,
  replay: ReplayVerifyResultView
): 'valid' | 'invalid' | null {
  const errors = replay.errors;
  if (!Array.isArray(errors)) {
    const n = replay.rounds_verified ?? 0;
    return roundIndex < n ? 'valid' : null;
  }
  const hasInvalid = errors.some(
    (e) =>
      e?.round_number === roundIndex &&
      (e.type === 'HASH_CHAIN_BROKEN' || (e.message && /hash/i.test(e.message)))
  );
  if (hasInvalid) return 'invalid';
  const n = replay.rounds_verified ?? 0;
  return roundIndex < n ? 'valid' : null;
}

interface RoundsTimelineProps {
  transcriptJson?: string;
  replayVerifyResult?: unknown;
  packVerifyResult?: unknown;
}

export default function RoundsTimeline({
  transcriptJson,
  replayVerifyResult,
  packVerifyResult,
}: RoundsTimelineProps) {
  const transcript = parseTranscript(transcriptJson);
  const rounds = transcript?.rounds ?? [];
  const verifier = hasPerRoundVerifierOutput(replayVerifyResult)
    ? (replayVerifyResult as ReplayVerifyResultView)
    : hasPerRoundVerifierOutput(packVerifyResult)
      ? (packVerifyResult as ReplayVerifyResultView)
      : null;
  const showStatusColumns = verifier != null;

  if (rounds.length === 0) {
    return (
      <div className="panel rounds-timeline-panel">
        <h2 className="panel-title">ROUNDS TIMELINE</h2>
        <div className="panel-content">
          <p className="rounds-timeline-empty">No transcript rounds in pack.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel rounds-timeline-panel">
      <h2 className="panel-title">ROUNDS TIMELINE</h2>
      <div className="panel-content">
        <div className="rounds-timeline-wrapper">
          <table className="rounds-timeline-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Round type</th>
                <th>Signer / party</th>
                {showStatusColumns && (
                  <>
                    <th>Signature</th>
                    <th>Hash link</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rounds.map((round, i) => {
                const sigStatus = verifier ? getRoundSignatureStatus(round.round_number ?? i, verifier) : null;
                const hashStatus = verifier ? getRoundHashLinkStatus(round.round_number ?? i, verifier) : null;
                return (
                  <tr key={i}>
                    <td className="round-index">{round.round_number ?? i}</td>
                    <td className="round-type">{round.round_type ?? '—'}</td>
                    <td className="round-signer">{getRoundSignerLabel(round)}</td>
                    {showStatusColumns && (
                      <>
                        <td className="round-sig-status">
                          {sigStatus === 'valid' && <span className="status-valid">valid</span>}
                          {sigStatus === 'invalid' && <span className="status-invalid">invalid</span>}
                          {sigStatus === null && '—'}
                        </td>
                        <td className="round-hash-status">
                          {hashStatus === 'valid' && <span className="status-valid">valid</span>}
                          {hashStatus === 'invalid' && <span className="status-invalid">invalid</span>}
                          {hashStatus === null && '—'}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
