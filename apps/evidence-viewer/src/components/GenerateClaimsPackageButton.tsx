import { useCallback, useState } from 'react';
import type { AuditorPackData } from '../types';
import { getIntegrityVerdict } from '../lib/integrityVerdict';
import { buildClaimsIntakePackage } from '../lib/buildClaimsIntakePackage';
import type { AttachmentEntry } from './AttachmentsDropZone';

interface GenerateClaimsPackageButtonProps {
  packData: AuditorPackData;
  attachments?: AttachmentEntry[];
  claimType?: string;
  onGenerated?: () => void;
  disabled?: boolean;
}

export default function GenerateClaimsPackageButton({
  packData,
  attachments = [],
  claimType = '',
  onGenerated,
  disabled = false,
}: GenerateClaimsPackageButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verdict = getIntegrityVerdict(packData);
  const isUntrusted = verdict.verdict === 'TAMPERED' || verdict.verdict === 'INVALID';
  const showTamperWarning = isUntrusted && attachments.length > 0;

  const handleClick = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let auditorPackBytes: ArrayBuffer;
      let auditorPackOriginalFilename: string | undefined;
      if (packData.zipFile) {
        auditorPackBytes = await packData.zipFile.arrayBuffer();
        auditorPackOriginalFilename = packData.zipFile.name;
      } else if (packData.source === 'demo_public' && packData.demoPublicPath) {
        const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '';
        const url = `${base}/${packData.demoPublicPath}`.replace(/\/+/g, '/');
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to load auditor pack for embedding');
        auditorPackBytes = await res.arrayBuffer();
        auditorPackOriginalFilename = packData.demoPublicPath.split('/').pop();
      } else {
        throw new Error('Cannot embed auditor pack: no file or demo path available');
      }

      const generatedAt = new Date().toISOString();
      const blob = await buildClaimsIntakePackage({
        packData,
        auditorPackBytes,
        auditorPackOriginalFilename,
        attachments,
        claimType,
        generatedAt,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `claims-package-${packData.transcriptId?.slice(0, 12) ?? 'export'}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      onGenerated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setLoading(false);
    }
  }, [packData, attachments, claimType, onGenerated]);

  const isDisabled = disabled || loading;

  return (
    <div className="generate-claims-wrap">
      {showTamperWarning && (
        <p className="claims-tamper-warning">
          Attachments included, but base evidence pack failed integrity; treat as compromised.
        </p>
      )}
      <button
        type="button"
        className="generate-claims-btn"
        onClick={handleClick}
        disabled={isDisabled}
        title={disabled ? 'Not eligible — evidence untrusted.' : undefined}
      >
        {loading ? 'Generating...' : 'Generate Claims Intake Package'}
      </button>
      {error && <span className="export-error">{error}</span>}
    </div>
  );
}
