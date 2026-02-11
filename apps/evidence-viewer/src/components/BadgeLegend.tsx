import { useState, useRef, useEffect } from 'react';

/**
 * Global badge legend — two independent axes.
 * Axis 1: Evidence Integrity (authoritative). Axis 2: Outcome State.
 */
export default function BadgeLegend() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div className="badge-legend-wrap" ref={containerRef}>
      <button
        type="button"
        className="badge-legend-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        title="Badge color legend"
      >
        Legend
      </button>
      {open && (
        <div className="badge-legend-popover" role="dialog" aria-label="Badge color legend">
          <div className="badge-legend-axis">
            <div className="badge-legend-axis-title">Evidence Integrity</div>
            <ul className="badge-legend-list">
              <li>
                <span className="badge-legend-swatch status-good" aria-hidden />
                <span><strong>VERIFIED</strong> — Cryptographic verification passed</span>
              </li>
              <li>
                <span className="badge-legend-swatch status-bad" aria-hidden />
                <span><strong>INVALID</strong> — Verification failed</span>
              </li>
              <li>
                <span className="badge-legend-swatch status-bad-tampered" aria-hidden />
                <span><strong>TAMPERED</strong> — Evidence altered after signing</span>
              </li>
            </ul>
          </div>
          <div className="badge-legend-axis">
            <div className="badge-legend-axis-title">Outcome State</div>
            <ul className="badge-legend-list">
              <li>
                <span className="badge-legend-swatch status-good" aria-hidden />
                <span><strong>COMPLETED</strong> — Settlement succeeded</span>
              </li>
              <li>
                <span className="badge-legend-swatch status-warn" aria-hidden />
                <span><strong>ABORTED</strong> — Policy or rule abort</span>
              </li>
              <li>
                <span className="badge-legend-swatch status-warn" aria-hidden />
                <span><strong>TIMEOUT</strong> — Counterparty unreachable</span>
              </li>
              <li>
                <span className="badge-legend-swatch status-muted" aria-hidden />
                <span><strong>CLAIMED</strong> — Outcome claimed but untrusted</span>
              </li>
              <li>
                <span className="badge-legend-swatch status-muted" aria-hidden />
                <span><strong>UNAVAILABLE</strong> — Outcome cannot be determined</span>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
