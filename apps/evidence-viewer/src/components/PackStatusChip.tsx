import type { AuditorPackData } from '../types';
import { getIntegrityVerdict } from '../lib/integrityVerdict';

interface PackStatusChipProps {
  fileName: string;
  packData: AuditorPackData;
}

export default function PackStatusChip({ fileName, packData }: PackStatusChipProps) {
  const verdict = getIntegrityVerdict(packData).verdict;

  const getStatusClass = () => {
    if (verdict === 'VERIFIED') return 'status-valid';
    if (verdict === 'TAMPERED' || verdict === 'INVALID') return 'status-invalid';
    return 'status-indeterminate';
  };

  const getBadgeLabel = () => {
    if (verdict === 'VERIFIED') return 'Valid';
    if (verdict === 'TAMPERED') return 'Tampered';
    if (verdict === 'INVALID') return 'Invalid';
    return 'Indeterminate';
  };

  const displayName = fileName.replace(/\.zip$/i, '').replace(/_/g, '_');

  return (
    <div className="pack-status-chip">
      <span className={`chip-badge ${getStatusClass()}`}>
        {getBadgeLabel()}
      </span>
      {(verdict === 'TAMPERED' || verdict === 'INVALID') && (
        <span className="chip-tamper-note status-invalid">Integrity failed</span>
      )}
      <span className="chip-filename">{displayName}</span>
    </div>
  );
}
