/**
 * Snapshot and semantics tests for SummaryPanel: header badges, gating of Result/Responsibility/Economic,
 * and warning banner for invalid/tamper states.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SummaryPanel from '../SummaryPanel';
import {
  mockPackTrustedCompleted,
  mockPackTrustedAborted,
  mockPackTrustedTimeout,
  mockPackUntrustedInvalid,
  mockPackUntrustedTampered,
} from './summaryPanelPackMocks';

describe('SummaryPanel', () => {
  describe('header badges (Integrity + Outcome)', () => {
    it('trusted completed: VERIFIED + COMPLETED', () => {
      render(<SummaryPanel packData={mockPackTrustedCompleted()} />);
      expect(screen.getByRole('status', { name: /Integrity: VERIFIED/i })).toBeInTheDocument();
      expect(screen.getByRole('status', { name: /Outcome: COMPLETED/i })).toBeInTheDocument();
    });

    it('trusted aborted: VERIFIED + ABORTED', () => {
      render(<SummaryPanel packData={mockPackTrustedAborted()} />);
      expect(screen.getByRole('status', { name: /Integrity: VERIFIED/i })).toBeInTheDocument();
      expect(screen.getByRole('status', { name: /Outcome: ABORTED/i })).toBeInTheDocument();
    });

    it('trusted timeout: VERIFIED + TIMEOUT', () => {
      render(<SummaryPanel packData={mockPackTrustedTimeout()} />);
      expect(screen.getByRole('status', { name: /Integrity: VERIFIED/i })).toBeInTheDocument();
      expect(screen.getByRole('status', { name: /Outcome: TIMEOUT/i })).toBeInTheDocument();
    });

    it('untrusted invalid: INVALID + CLAIMED (muted)', () => {
      render(<SummaryPanel packData={mockPackUntrustedInvalid()} />);
      expect(screen.getByRole('status', { name: /Integrity: INVALID/i })).toBeInTheDocument();
      expect(screen.getByRole('status', { name: /Outcome: CLAIMED/i })).toBeInTheDocument();
    });

    it('untrusted tampered: TAMPERED + CLAIMED (muted)', () => {
      render(<SummaryPanel packData={mockPackUntrustedTampered()} />);
      expect(screen.getByRole('status', { name: /Integrity: TAMPERED/i })).toBeInTheDocument();
      expect(screen.getByRole('status', { name: /Outcome: CLAIMED/i })).toBeInTheDocument();
    });
  });

  describe('untrusted states: Result/Responsibility/Economic hidden', () => {
    it('trusted completed shows Result section (Status, Money moved, etc.)', () => {
      render(<SummaryPanel packData={mockPackTrustedCompleted()} />);
      expect(screen.getByText('Result')).toBeInTheDocument();
      expect(screen.getByText('Responsibility')).toBeInTheDocument();
      expect(screen.getByText('Economic snapshot')).toBeInTheDocument();
      expect(screen.queryByText(/Hidden due to untrusted evidence/i)).not.toBeInTheDocument();
    });

    it('untrusted invalid shows warning banner and hidden note, no Result/Responsibility/Economic as fact', () => {
      render(<SummaryPanel packData={mockPackUntrustedInvalid()} />);
      expect(screen.getByRole('alert')).toHaveTextContent(/Blocked due to untrusted evidence/i);
      expect(screen.getByRole('button', { name: /See Technical Verification/i })).toBeInTheDocument();
      expect(screen.getByText(/Hidden due to untrusted evidence/i)).toBeInTheDocument();
      expect(screen.queryByText('Result')).not.toBeInTheDocument();
      expect(screen.queryByText('Responsibility')).not.toBeInTheDocument();
      expect(screen.queryByText('Economic snapshot')).not.toBeInTheDocument();
    });

    it('untrusted tampered shows warning banner and hidden note', () => {
      render(<SummaryPanel packData={mockPackUntrustedTampered()} />);
      expect(screen.getByRole('alert')).toHaveTextContent(/Blocked due to untrusted evidence/i);
      expect(screen.getByText(/Hidden due to untrusted evidence/i)).toBeInTheDocument();
    });
  });

  describe('snapshot (key structure)', () => {
    it('trusted completed snapshot', () => {
      const { container } = render(<SummaryPanel packData={mockPackTrustedCompleted()} />);
      const summary = container.querySelector('.summary-panel');
      expect(summary).toBeTruthy();
      const badges = summary!.querySelector('.summary-header-badges');
      expect(badges?.textContent).toMatch(/VERIFIED/);
      expect(badges?.textContent).toMatch(/COMPLETED/);
    });

    it('untrusted invalid snapshot', () => {
      const { container } = render(<SummaryPanel packData={mockPackUntrustedInvalid()} />);
      const summary = container.querySelector('.summary-panel');
      expect(summary).toBeTruthy();
      expect(summary!.querySelector('.summary-warning-banner')).toBeTruthy();
      expect(summary!.querySelector('.summary-hidden-note')).toBeTruthy();
    });
  });
});
