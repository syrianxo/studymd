// components/ErrorBoundary.tsx
// React error boundary for major view components (Dashboard, FlashcardView, ExamView).
// On error: shows a friendly StudyMD-styled fallback with a "Report This Issue" button
// that auto-fills the FeedbackWidget with the error details.
'use client';

import React, { Component, type ReactNode } from 'react';
import { openFeedbackWidget } from './FeedbackWidget';

interface Props {
  children: ReactNode;
  /** Display name shown in the fallback (e.g. "Dashboard", "Flashcard Study") */
  name?: string;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  errorStack: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '', errorStack: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message ?? 'An unknown error occurred.',
      errorStack: error?.stack ?? '',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[StudyMD ErrorBoundary]', error, info.componentStack);
  }

  handleReport = () => {
    const { name = 'Unknown' } = this.props;
    const { errorMessage, errorStack } = this.state;
    const msg = [
      `Crash in: ${name}`,
      `Error: ${errorMessage}`,
      errorStack ? `\nStack (truncated):\n${errorStack.slice(0, 500)}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    openFeedbackWidget('Bug Report', msg);
  };

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '', errorStack: '' });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { name = 'this section' } = this.props;

    return (
      <>
        <style>{css}</style>
        <div className="eb-wrap" role="alert">
          <div className="eb-card">
            <div className="eb-icon">⚠️</div>
            <h2 className="eb-title">Something went wrong</h2>
            <p className="eb-sub">
              {name} ran into an unexpected error. Your progress is safe — try
              reloading or click &ldquo;Report This Issue&rdquo; to let us know.
            </p>

            {/* Collapsed error detail */}
            <details className="eb-details">
              <summary className="eb-summary">Show error details</summary>
              <pre className="eb-pre">{this.state.errorMessage}</pre>
            </details>

            <div className="eb-actions">
              <button className="eb-btn eb-btn-primary" onClick={this.handleRetry}>
                ↺ Try Again
              </button>
              <button className="eb-btn eb-btn-ghost" onClick={this.handleReport}>
                🐛 Report This Issue
              </button>
              <button
                className="eb-btn eb-btn-ghost"
                onClick={() => window.location.reload()}
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }
}

// ── Scoped CSS ────────────────────────────────────────────────────────────────
const css = `
.eb-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  padding: 40px 20px;
  background: var(--bg, #0d0f14);
}
.eb-card {
  background: var(--surface, #13161d);
  border: 1px solid rgba(239,68,68,0.2);
  border-radius: 20px;
  padding: 36px 32px 32px;
  max-width: 500px;
  width: 100%;
  text-align: center;
  box-shadow: 0 0 60px rgba(239,68,68,0.06);
}
.eb-icon { font-size: 40px; margin-bottom: 14px; }
.eb-title {
  font-family: 'Fraunces', serif;
  font-size: 22px;
  font-weight: 700;
  color: var(--text, #e8eaf0);
  margin-bottom: 10px;
}
.eb-sub {
  font-size: 14px;
  color: var(--text-muted, #6b7280);
  line-height: 1.65;
  margin-bottom: 20px;
}
.eb-details { text-align: left; margin-bottom: 20px; }
.eb-summary {
  font-size: 12px;
  color: var(--text-muted, #6b7280);
  cursor: pointer;
  font-family: 'DM Mono', monospace;
  margin-bottom: 8px;
  list-style: none;
}
.eb-summary::-webkit-details-marker { display: none; }
.eb-summary::before { content: '▶ '; font-size: 9px; }
details[open] .eb-summary::before { content: '▼ '; }
.eb-pre {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  padding: 12px 14px;
  font-family: 'DM Mono', monospace;
  font-size: 11px;
  color: #f87171;
  overflow-x: auto;
  white-space: pre-wrap;
  line-height: 1.6;
  max-height: 180px;
  overflow-y: auto;
}
.eb-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}
.eb-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 18px;
  min-height: 44px;
  border-radius: 10px;
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.13s, color 0.13s;
}
.eb-btn-primary {
  background: var(--accent, #5b8dee);
  color: #fff;
  border-color: var(--accent, #5b8dee);
}
.eb-btn-primary:hover { background: color-mix(in srgb,var(--accent,#5b8dee) 82%,black); }
.eb-btn-ghost {
  background: rgba(255,255,255,0.05);
  color: var(--text-muted, #6b7280);
  border-color: rgba(255,255,255,0.1);
}
.eb-btn-ghost:hover { background: rgba(255,255,255,0.1); color: var(--text, #e8eaf0); }
@media (max-width: 479px) {
  .eb-card { padding: 24px 16px 20px; }
  .eb-actions { flex-direction: column; align-items: stretch; }
}
`;
