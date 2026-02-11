import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches React render errors and displays a fallback instead of a blank screen.
 * Production-ready: prevents unhandled errors from breaking the entire viewer.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Evidence Viewer error:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          className="error-boundary-fallback"
          role="alert"
          style={{
            padding: '2rem',
            maxWidth: '600px',
            margin: '2rem auto',
            fontFamily: 'system-ui, sans-serif',
            background: 'rgba(220, 100, 80, 0.1)',
            borderRadius: '8px',
            border: '1px solid rgba(220, 100, 80, 0.3)',
          }}
        >
          <h2 style={{ margin: '0 0 1rem', fontSize: '1.25rem' }}>Something went wrong</h2>
          <p style={{ margin: '0 0 1rem', color: '#666' }}>
            The Evidence Viewer encountered an error. Try reloading the page or loading a different pack.
          </p>
          <details style={{ marginTop: '1rem', fontSize: '0.875rem' }}>
            <summary style={{ cursor: 'pointer' }}>Error details</summary>
            <pre style={{ marginTop: '0.5rem', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {this.state.error.message}
            </pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}
