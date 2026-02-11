import { useState, useEffect, useRef, useCallback } from 'react';
import FileUpload from './components/FileUpload';
import DemoPackLoader from './components/DemoPackLoader';
import ExecutionSummaryPanel from './components/ExecutionSummaryPanel';
import RoundsTimeline from './components/RoundsTimeline';
import OutcomePanel from './components/OutcomePanel';
import ExpertOpinionsPanel from './components/ExpertOpinionsPanel';
import IntegrityPanel from './components/IntegrityPanel';
import WarningsAndExceptionsPanel from './components/WarningsAndExceptionsPanel';
import ResponsibilityPanel from './components/ResponsibilityPanel';
import InsurancePanel from './components/InsurancePanel';
import EvidenceFilesPanel from './components/EvidenceFilesPanel';
import VerifyBlock from './components/VerifyBlock';
import ExportPDFButton from './components/ExportPDFButton';
import ExportInsurerPDFButton from './components/ExportInsurerPDFButton';
import ClaimsAndFollowUpSection from './components/ClaimsAndFollowUpSection';
import SummaryPanel from './components/SummaryPanel';
import type { AttachmentEntry } from './components/AttachmentsDropZone';
import PartyModal from './components/PartyModal';
import { loadPackFromFile, PackLoadError } from './lib/loadPack';
import { loadPassportSnapshotFromFile, PassportSnapshotLoadError } from './lib/loadPassportSnapshot';
import { getIntegrityVerdict } from './lib/integrityVerdict';
import { getJudgment } from './lib/summaryExtract';
import type { AuditorPackData, PackVerifyResultView, ReplayVerifyResultView } from './types';
import type { PassportSnapshotView } from './types';
import './App.css';

export const SNAPSHOT_LOADER_BUTTON_ID = 'snapshot-loader-btn';

const VIEWER_TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'execution', label: 'Execution' },
  { id: 'technical-verification', label: 'Verification' },
  { id: 'explanation-responsibility', label: 'Outcome' },
  { id: 'insurance-claims', label: 'Claims' },
  { id: 'evidence', label: 'Evidence' },
] as const;

function truncateFilename(name: string, len: number): string {
  if (name.length <= len) return name;
  return name.slice(0, 8) + '…' + name.slice(-Math.min(len - 9, 12));
}

function App() {
  const [packData, setPackData] = useState<AuditorPackData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentEntry[]>([]);
  const [partyModalOpen, setPartyModalOpen] = useState(false);
  const [partyModalPubkey, setPartyModalPubkey] = useState<string | null>(null);
  const [globalPassportSnapshot, setGlobalPassportSnapshot] = useState<PassportSnapshotView | null>(null);
  const [globalPassportSnapshotFileName, setGlobalPassportSnapshotFileName] = useState<string | null>(null);
  const [snapshotLoadError, setSnapshotLoadError] = useState<string | null>(null);
  const [activeViewerTab, setActiveViewerTab] = useState<string>('summary');
  const snapshotFileInputRef = useRef<HTMLInputElement>(null);

  const openParty = (pubkey: string) => {
    setPartyModalPubkey(pubkey);
    setPartyModalOpen(true);
  };
  const closeParty = () => {
    setPartyModalOpen(false);
    setPartyModalPubkey(null);
  };

  const effectiveSnapshot: PassportSnapshotView | null | undefined =
    globalPassportSnapshot ?? packData?.boxerSnapshot ?? null;

  const handlePassportSnapshotFile = useCallback(async (file: File) => {
    setSnapshotLoadError(null);
    try {
      const snapshot = await loadPassportSnapshotFromFile(file);
      setGlobalPassportSnapshot(snapshot);
      setGlobalPassportSnapshotFileName(file.name);
    } catch (e) {
      setSnapshotLoadError(e instanceof PassportSnapshotLoadError ? e.message : 'Failed to load snapshot');
      setGlobalPassportSnapshot(null);
      setGlobalPassportSnapshotFileName(null);
    }
  }, []);

  const clearPassportSnapshot = useCallback(() => {
    setGlobalPassportSnapshot(null);
    setGlobalPassportSnapshotFileName(null);
    setSnapshotLoadError(null);
    if (snapshotFileInputRef.current) snapshotFileInputRef.current.value = '';
  }, []);

  const handleFileSelect = async (file: File, verifyPath?: string) => {
    // When loading a demo, start from a fresh state (clear any existing pack first)
    if (verifyPath != null) {
      setPackData(null);
      setAttachments([]);
      setError(null);
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await loadPackFromFile(file);
      // Demo packs: show packs/<file>.zip; dragged file: show filename
      setPackData(
        verifyPath != null
          ? { ...data, source: 'demo_public', demoPublicPath: verifyPath }
          : data
      );
    } catch (err) {
      if (err instanceof PackLoadError) {
        const found = err.foundPaths.length > 0
          ? `\n\nFound paths in ZIP:\n${err.foundPaths.map((p) => `  • ${p}`).join('\n')}`
          : '\n\nZIP appears empty or has no recognized entries.';
        setError(`Invalid auditor pack. Missing: ${err.missing.join(', ')}.${found}`);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to parse auditor pack');
      }
      setPackData(null);
      setAttachments([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Listen for demo pack load events
  useEffect(() => {
    const handleDemoPack = (event: CustomEvent<{ file: File }>) => {
      handleFileSelect(event.detail.file);
    };
    window.addEventListener('loadDemoPack', handleDemoPack as EventListener);
    return () => {
      window.removeEventListener('loadDemoPack', handleDemoPack as EventListener);
    };
  }, []);

  // Listen for expand-section: switch to the tab with that id (support legacy ids)
  useEffect(() => {
    const handler = (e: CustomEvent<{ id: string }>) => {
      const id = e.detail?.id;
      if (!id) return;
      if (VIEWER_TABS.some((t) => t.id === id)) {
        setActiveViewerTab(id);
        return;
      }
      if (id === 'explanation' || id === 'responsibility' || id === 'trust-signals') setActiveViewerTab('explanation-responsibility');
      if (id === 'claims-followup' || id === 'insurance') setActiveViewerTab('insurance-claims');
    };
    window.addEventListener('expand-section', handler as EventListener);
    return () => window.removeEventListener('expand-section', handler as EventListener);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-inner">
          <h1>pact<span className="app-title-underscore">_</span> Evidence Viewer</h1>
          <p className="app-subtitle">Read-only evidence viewer for Auditor Packs</p>
        </div>
      </header>

      <main className="app-main">
        {!packData ? (
          <div className="container load-page">
            <div className="read-only-frame">
              <div className="read-only-frame-title">Read-Only Evidence Viewer</div>
              <div className="read-only-frame-desc">
                <p>This viewer is read-only and does not execute transactions. The source of truth is the Auditor Pack ZIP.</p>
                <p>This UI does not perform verification; verification must be done with the pact-verifier CLI.</p>
                <p>For audit, dispute review, and insurance workflows. This tool does not provide legal advice.</p>
              </div>
            </div>
            <DemoPackLoader onLoadPack={handleFileSelect} isLoading={isLoading} onError={(msg) => setError(msg)} />
            <p className="upload-helper">Or drag-drop an Auditor Pack ZIP below</p>
            <FileUpload
              onFileSelect={handleFileSelect}
              onError={(msg) => setError(msg || null)}
              isLoading={isLoading}
            />
            <VerifyBlock packData={null} />
            {error && (
              <div className="error-message" role="alert">
                <strong>Error:</strong> {error}
              </div>
            )}
          </div>
        ) : (
          <div className="container viewer-section">
            {packData.source === 'demo_public' &&
              (packData.packVerifyResult as { recompute_ok?: boolean } | undefined)?.recompute_ok === false &&
              !packData.demoPublicPath?.includes('semantic_tampered') && (
                <div className="demo-out-of-sync-banner" role="alert">
                  This demo pack is out of sync with the current verifier. Regenerate required.
                </div>
              )}

            {/* Load bar: back + status + snapshot loader + exports */}
            <header id="viewer-load-bar" className="viewer-header">
              <button
                className="back-button"
                onClick={() => {
                  setPackData(null);
                  setAttachments([]);
                }}
              >
                ← Load different pack
              </button>
              <div className="viewer-header-right">
                <div className="viewer-status-bar" role="status" aria-label="Load status">
                  <span className="viewer-status-item viewer-status-loaded">
                    <span className="viewer-status-dot" aria-hidden>●</span>
                    Pack: LOADED
                  </span>
                  <span className={effectiveSnapshot != null ? 'viewer-status-item viewer-status-loaded' : 'viewer-status-item viewer-status-not-loaded'}>
                    <span className="viewer-status-dot" aria-hidden>●</span>
                    Snapshot: {effectiveSnapshot != null ? 'LOADED' : 'NOT LOADED'}
                    {effectiveSnapshot != null && (
                      <>
                        {effectiveSnapshot.version != null && ` (${effectiveSnapshot.version})`}
                        {globalPassportSnapshotFileName && (
                          <span className="viewer-status-filename" title={globalPassportSnapshotFileName}>
                            {' '}{truncateFilename(globalPassportSnapshotFileName, 24)}
                          </span>
                        )}
                        {globalPassportSnapshot != null && (
                          <button
                            type="button"
                            className="viewer-status-clear-btn"
                            onClick={clearPassportSnapshot}
                            aria-label="Clear passport snapshot"
                          >
                            Clear
                          </button>
                        )}
                      </>
                    )}
                  </span>
                </div>
                {effectiveSnapshot == null && (
                  <>
                    <input
                      ref={snapshotFileInputRef}
                      type="file"
                      accept=".json,application/json"
                      className="viewer-snapshot-input-hidden"
                      aria-hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handlePassportSnapshotFile(f);
                        e.target.value = '';
                      }}
                    />
                    <button
                      id={SNAPSHOT_LOADER_BUTTON_ID}
                      type="button"
                      className="viewer-snapshot-load-btn"
                      onClick={() => snapshotFileInputRef.current?.click()}
                      aria-label="Load passport snapshot (JSON file)"
                    >
                      Load Passport Snapshot
                    </button>
                  </>
                )}
                {snapshotLoadError && (
                  <span className="viewer-snapshot-error" role="alert">
                    {snapshotLoadError}
                  </span>
                )}
                <div className="export-buttons-row" role="group" aria-label="Export actions">
                  <ExportPDFButton packData={packData} />
                  <ExportInsurerPDFButton packData={packData} />
                </div>
              </div>
            </header>

            {/* Revocation warning (warn-only): evidence remains valid */}
            {effectiveSnapshot?.entities?.some((e) => e.anchors?.some((a) => a.revoked === true)) && (
              <div className="viewer-revocation-banner" role="alert">
                Warning: One or more identity attestations have been revoked. Evidence remains verified; trust signals may be downgraded.
              </div>
            )}

            {/* Nav tabs: directly under load bar */}
            {(() => {
              const visibleTabs = VIEWER_TABS.filter(
                (t) => !('optional' in t && t.optional) || effectiveSnapshot != null
              );
              return (
                <nav className="viewer-tab-list" role="tablist" aria-label="Viewer sections">
                  {visibleTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      id={`viewer-tab-${tab.id}`}
                      aria-selected={activeViewerTab === tab.id}
                      aria-controls={`viewer-tabpanel-${tab.id}`}
                      className="viewer-tab"
                      onClick={() => setActiveViewerTab(tab.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                          e.preventDefault();
                          const i = visibleTabs.findIndex((t) => t.id === activeViewerTab);
                          const next = e.key === 'ArrowRight' ? i + 1 : i - 1;
                          const idx = next < 0 ? visibleTabs.length - 1 : next % visibleTabs.length;
                          setActiveViewerTab(visibleTabs[idx].id);
                        }
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </nav>
              );
            })()}

            {/* Tab panels */}
            <div
              role="tabpanel"
              id="viewer-tabpanel-summary"
              aria-labelledby="viewer-tab-summary"
              className="viewer-tab-panel"
              hidden={activeViewerTab !== 'summary'}
            >
              <SummaryPanel packData={packData} boxerSnapshot={effectiveSnapshot ?? null} onOpenParty={openParty} />
            </div>

            <div
              role="tabpanel"
              id="viewer-tabpanel-explanation-responsibility"
              aria-labelledby="viewer-tab-explanation-responsibility"
              className="viewer-tab-panel"
              hidden={activeViewerTab !== 'explanation-responsibility'}
            >
              <OutcomePanel gcView={packData.gcView} integrityVerdict={getIntegrityVerdict(packData).verdict} />
              <ExpertOpinionsPanel
                packData={packData}
                boxerSnapshot={effectiveSnapshot ?? null}
                onOpenParty={openParty}
              />
              <WarningsAndExceptionsPanel packData={packData} />
              <ResponsibilityPanel
                judgment={packData.judgment}
                gcView={packData.gcView}
                integrityVerdict={getIntegrityVerdict(packData).verdict}
                onOpenParty={openParty}
              />
            </div>

            <div
              role="tabpanel"
              id="viewer-tabpanel-evidence"
              aria-labelledby="viewer-tab-evidence"
              className="viewer-tab-panel"
              hidden={activeViewerTab !== 'evidence'}
            >
              <EvidenceFilesPanel packData={packData} />
            </div>

            <div
              role="tabpanel"
              id="viewer-tabpanel-execution"
              aria-labelledby="viewer-tab-execution"
              className="viewer-tab-panel"
              hidden={activeViewerTab !== 'execution'}
            >
              <ExecutionSummaryPanel
                gcView={packData.gcView}
                integrityVerdict={getIntegrityVerdict(packData).verdict}
                transcriptJson={packData.transcript}
                replayVerifyResult={packData.replayVerifyResult as { errors?: Array<{ round_number?: number; message?: string }> } | null | undefined}
              />
            </div>

            <div
              role="tabpanel"
              id="viewer-tabpanel-technical-verification"
              aria-labelledby="viewer-tab-technical-verification"
              className="viewer-tab-panel"
              hidden={activeViewerTab !== 'technical-verification'}
            >
              <IntegrityPanel
                gcView={packData.gcView}
                packFileName={packData.zipFile?.name}
                merkleDigest={packData.merkleDigest}
                packData={packData}
                onOpenParty={openParty}
              />
              <RoundsTimeline
                transcriptJson={packData.transcript}
                packData={packData}
                boxerSnapshot={effectiveSnapshot ?? null}
                onOpenParty={openParty}
                replayVerifyResult={packData.replayVerifyResult as ReplayVerifyResultView | null | undefined}
                packVerifyResult={packData.packVerifyResult as PackVerifyResultView | null | undefined}
              />
              <VerifyBlock packData={packData} />
            </div>

            <div
              role="tabpanel"
              id="viewer-tabpanel-insurance-claims"
              aria-labelledby="viewer-tab-insurance-claims"
              className="viewer-tab-panel"
              hidden={activeViewerTab !== 'insurance-claims'}
            >
              <InsurancePanel insurerSummary={packData.insurerSummary} />
              <ClaimsAndFollowUpSection
                packData={packData}
                attachments={attachments}
                onAttachmentsChange={setAttachments}
              />
            </div>
          </div>
        )}
      </main>

      {packData && (
        <PartyModal
          isOpen={partyModalOpen}
          onClose={closeParty}
          pubkey={partyModalPubkey ?? ''}
          loadedPack={packData}
          boxerSnapshot={effectiveSnapshot ?? null}
          integrityVerdict={getIntegrityVerdict(packData)}
        />
      )}
    </div>
  );
}

export default App;
