import type { InsurerSummary } from "../types";

const COVERAGE_LABELS: Record<string, string> = {
  COVERED: 'Covered',
  COVERED_WITH_SURCHARGE: 'Covered, with surcharge applied',
  ESCROW_REQUIRED: 'Escrow required',
  EXCLUDED: 'Not covered',
  NOT_COVERED: 'Not covered',
};

function coverageDisplay(coverage: string): { label: string; raw: string } {
  const label = COVERAGE_LABELS[coverage] ?? coverage;
  return { label, raw: coverage };
}

interface InsurancePanelProps {
  insurerSummary: InsurerSummary;
}

export default function InsurancePanel({ insurerSummary }: InsurancePanelProps) {
  const { label: coverageLabel, raw: coverageRaw } = coverageDisplay(insurerSummary.coverage);

  return (
    <div className="insurance-panel panel">
      <h3>Insurance</h3>
      <dl className="case-meta">
        <dt>Coverage</dt>
        <dd>
          <span className="insurance-coverage-label">{coverageLabel}</span>
          <span className="insurance-coverage-raw" title={coverageRaw}>
            {coverageRaw}
          </span>
        </dd>
        {insurerSummary.risk_factors?.length ? (
          <>
            <dt>Risk Factors</dt>
            <dd>{insurerSummary.risk_factors.join(', ')}</dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}
