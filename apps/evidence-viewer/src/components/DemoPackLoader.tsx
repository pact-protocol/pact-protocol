import { useCallback } from 'react';

interface DemoPackLoaderProps {
  onLoadPack: (file: File, verifyPath?: string) => void;
  isLoading: boolean;
  onError?: (message: string) => void;
}

/** Demo packs: labels must match pack semantics. Expected UI when loaded:
 *  - Success: COMPLETED, NO_FAULT, Integrity VALID
 *  - Policy Abort 101: ABORTED_POLICY, BUYER_AT_FAULT, Integrity VALID
 *  - Timeout 420: FAILED_PROVIDER_UNREACHABLE, PROVIDER_AT_FAULT, Integrity VALID
 *  - Tamper: Integrity TAMPERED (ok=false, recompute_ok=false)
 */
type DemoPack = {
  id: string;
  label: string;
  description: string;
  path: string;
  filename: string;
};

const QUICK_DEMOS: DemoPack[] = [
  { id: 'success', label: 'Success', description: 'Completed deal, no fault.', path: 'packs/auditor_pack_success.zip', filename: 'auditor_pack_success.zip' },
  { id: '101', label: 'Policy Abort 101', description: 'Policy violation, buyer at fault.', path: 'packs/auditor_pack_101.zip', filename: 'auditor_pack_101.zip' },
  { id: '420', label: 'Timeout 420', description: 'Provider unreachable.', path: 'packs/auditor_pack_420.zip', filename: 'auditor_pack_420.zip' },
  { id: 'tamper', label: 'Tamper', description: 'Tampered evidence bundle.', path: 'packs/auditor_pack_semantic_tampered.zip', filename: 'auditor_pack_semantic_tampered.zip' },
];

const PILOT_DEMOS: DemoPack[] = [
  { id: 'art', label: 'Art Acquisition (Success)', description: 'Art acquisition with evidence and economic terms.', path: 'packs/auditor_pack_art_success.zip', filename: 'auditor_pack_art_success.zip' },
  { id: 'api', label: 'Autonomous API Procurement (Success)', description: 'API procurement with trust gate and economic terms.', path: 'packs/auditor_pack_api_success.zip', filename: 'auditor_pack_api_success.zip' },
];

export default function DemoPackLoader({ onLoadPack, isLoading, onError }: DemoPackLoaderProps) {
  const loadDemo = useCallback(
    async (demo: DemoPack) => {
      try {
        const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '';
        const url = `${base}/${demo.path}`.replace(/\/+/g, '/');
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch ${demo.filename}`);
        const blob = await res.blob();
        const file = new File([blob], demo.filename, { type: 'application/zip' });
        onLoadPack(file, demo.path);
      } catch (err) {
        console.error(err);
        onError?.(err instanceof Error ? err.message : 'Failed to load demo pack');
      }
    },
    [onLoadPack, onError]
  );

  return (
    <div className="demo-pack-loader">
      <div className="demo-pack-row">
        <span className="demo-label">Quick demos</span>
        <div className="demo-pack-buttons">
          {QUICK_DEMOS.map((d) => (
            <button
              key={d.id}
              type="button"
              className="demo-pack-btn"
              onClick={() => loadDemo(d)}
              disabled={isLoading}
            >
              <span className="demo-pack-btn-name">{d.label}</span>
              <span className="demo-pack-btn-desc">{d.description}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="demo-pack-row">
        <span className="demo-label">Pilots</span>
        <div className="demo-pack-buttons">
          {PILOT_DEMOS.map((d) => (
            <button
              key={d.id}
              type="button"
              className="demo-pack-btn"
              onClick={() => loadDemo(d)}
              disabled={isLoading}
            >
              <span className="demo-pack-btn-name">{d.label}</span>
              <span className="demo-pack-btn-desc">{d.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
