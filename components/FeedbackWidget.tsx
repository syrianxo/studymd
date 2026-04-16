// components/FeedbackWidget.tsx
// Floating feedback button — appears on all pages via root layout.
// Submits to the `feedback` table in Supabase directly from the browser.
// The admin Feedback Inbox (/admin → Feedback) reads these rows automatically.
//
// Position is right-side by default. Pass position="left" for user-facing pages.
// On /admin the root layout renders with no prop (defaults to right) and
// the label is hidden (icon-only) so it does not clash with the left sidebar.
'use client';

import { useState, useCallback, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase';

type FeedbackType = 'Bug Report' | 'Suggestion' | 'Content Error' | 'Other';

const TYPES: FeedbackType[] = ['Bug Report', 'Suggestion', 'Content Error', 'Other'];

interface FeedbackWidgetProps {
  defaultType?: FeedbackType;
  defaultMessage?: string;
  open?: boolean;
  onClose?: () => void;
}

// Singleton trigger — lets ErrorBoundary open the widget programmatically
let _externalOpen: ((type: FeedbackType, msg: string) => void) | null = null;

export function openFeedbackWidget(type: FeedbackType = 'Bug Report', message = '') {
  _externalOpen?.(type, message);
}

export default function FeedbackWidget({
  defaultType,
  defaultMessage,
  open: controlledOpen,
  onClose,
}: FeedbackWidgetProps = {}) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin') ?? false;

  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>(defaultType ?? 'Bug Report');
  const [message, setMessage] = useState(defaultMessage ?? '');
  const [pageUrl, setPageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'ok' | 'err'>('ok');

  useEffect(() => {
    if (isOpen) setPageUrl(window.location.pathname);
  }, [isOpen]);

  useEffect(() => {
    _externalOpen = (t, m) => { setType(t); setMessage(m); setIsOpen(true); };
    return () => { _externalOpen = null; };
  }, []);

  useEffect(() => {
    if (controlledOpen !== undefined) setIsOpen(controlledOpen);
  }, [controlledOpen]);

  useEffect(() => { if (defaultType) setType(defaultType); }, [defaultType]);
  useEffect(() => { if (defaultMessage) setMessage(defaultMessage); }, [defaultMessage]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') handleClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, handleClose]);

  async function handleSubmit() {
    if (!message.trim()) return;
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.from('feedback').insert({
        user_id: user?.id ?? null,
        type,
        message: message.trim().slice(0, 2000),
        page_url: pageUrl || window.location.pathname,
        status: 'new',
      });

      if (error) throw error;

      setToastMsg('Thanks for your feedback!');
      setToastType('ok');
      setMessage('');
      setType('Bug Report');
      setTimeout(() => { setIsOpen(false); setToastMsg(null); onClose?.(); }, 1600);
    } catch (err: any) {
      setToastMsg(err?.message ?? 'Something went wrong. Please try again.');
      setToastType('err');
      setTimeout(() => setToastMsg(null), 3500);
    } finally {
      setSubmitting(false);
    }
  }

  // On admin: icon-only pill anchored bottom-right (clears left sidebar)
  // Elsewhere: icon + "Feedback" label anchored bottom-left
  const triggerClass = isAdmin ? 'fbw-trigger fbw-trigger-right fbw-trigger-icon-only' : 'fbw-trigger fbw-trigger-left';
  const overlayClass = isAdmin ? 'fbw-overlay fbw-overlay-right' : 'fbw-overlay fbw-overlay-left';

  return (
    <>
      <style>{css}</style>

      {!isOpen && (
        <button className={triggerClass} onClick={() => setIsOpen(true)} aria-label="Send feedback">
          <span className="fbw-trigger-emoji">💬</span>
          {!isAdmin && <span className="fbw-trigger-label">Feedback</span>}
        </button>
      )}

      {isOpen && (
        <div
          className={overlayClass}
          role="dialog"
          aria-modal="true"
          aria-label="Send Feedback"
          onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <div className="fbw-modal">
            <div className="fbw-modal-header">
              <div className="fbw-modal-title"><span>💬</span> Send Feedback</div>
              <button className="fbw-close" onClick={handleClose} aria-label="Close">✕</button>
            </div>

            <p className="fbw-modal-sub">
              Found a bug or have a suggestion? Let us know — it goes straight to the admin inbox.
            </p>

            <div className="fbw-field">
              <label className="fbw-label">Type</label>
              <div className="fbw-type-row">
                {TYPES.map(t => (
                  <button key={t} className={`fbw-type-btn${type === t ? ' fbw-type-active' : ''}`} onClick={() => setType(t)} type="button">
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="fbw-field">
              <label className="fbw-label" htmlFor="fbw-message">Message <span className="fbw-required">*</span></label>
              <textarea
                id="fbw-message"
                className="fbw-textarea"
                rows={5}
                placeholder="Describe the issue or your suggestion…"
                maxLength={2000}
                value={message}
                onChange={e => setMessage(e.target.value)}
                autoFocus
              />
              <div className="fbw-char-count">{message.length} / 2000</div>
            </div>

            <div className="fbw-field">
              <label className="fbw-label" htmlFor="fbw-url">Page URL</label>
              <input id="fbw-url" className="fbw-input" type="text" value={pageUrl} onChange={e => setPageUrl(e.target.value)} placeholder="/app" />
            </div>

            {toastMsg && (
              <div className={`fbw-inline-toast fbw-toast-${toastType}`}>
                {toastType === 'ok' ? '✓ ' : '⚠ '}{toastMsg}
              </div>
            )}

            <div className="fbw-actions">
              <button className="fbw-btn fbw-btn-ghost" onClick={handleClose} type="button">Cancel</button>
              <button className="fbw-btn fbw-btn-primary" onClick={handleSubmit} disabled={submitting || !message.trim()} type="button">
                {submitting ? 'Sending…' : 'Submit Feedback'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const css = `
/* ── Trigger button ──────────────────────────────────────────────────────── */
.fbw-trigger {
  position: fixed;
  bottom: 24px;
  z-index: 400;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--surface, #13161d);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 50px;
  padding: 9px 18px 9px 14px;
  color: var(--text-muted, #6b7280);
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(0,0,0,0.35);
  transition: background 0.18s, color 0.18s, border-color 0.18s, transform 0.18s, box-shadow 0.18s;
}
.fbw-trigger:hover {
  background: var(--surface2, #1a1e27);
  color: var(--text, #e8eaf0);
  border-color: rgba(91,141,238,0.4);
  transform: translateY(-2px);
  box-shadow: 0 8px 28px rgba(0,0,0,0.45);
}
/* Position variants */
.fbw-trigger-left  { left: 24px; }
.fbw-trigger-right { right: 24px; }
/* Admin: icon-only circle */
.fbw-trigger-icon-only {
  padding: 10px;
  width: 42px;
  height: 42px;
  justify-content: center;
  border-radius: 50%;
}
.fbw-trigger-emoji { font-size: 16px; line-height: 1; }

@media (max-width: 479px) {
  .fbw-trigger-left  { left: 12px; bottom: 16px; padding: 9px 12px; }
  .fbw-trigger-right { right: 12px; bottom: 16px; }
  .fbw-trigger-label { display: none; }
}

/* ── Overlay ─────────────────────────────────────────────────────────────── */
.fbw-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.65);
  backdrop-filter: blur(6px);
  z-index: 1200;
  display: flex;
  align-items: flex-end;
  padding: 0 0 24px 0;
  animation: fbw-overlay-in 0.15s ease;
}
@keyframes fbw-overlay-in { from { opacity: 0; } to { opacity: 1; } }
.fbw-overlay-left  { justify-content: flex-start; padding-left: 24px; }
.fbw-overlay-right { justify-content: flex-end;   padding-right: 24px; }

@media (max-width: 479px) {
  .fbw-overlay-left, .fbw-overlay-right {
    align-items: flex-end;
    justify-content: center;
    padding: 0;
  }
}

/* ── Modal card ──────────────────────────────────────────────────────────── */
.fbw-modal {
  background: var(--surface, #13161d);
  border: 1px solid rgba(255,255,255,0.11);
  border-radius: 18px;
  padding: 24px;
  width: 100%;
  max-width: 440px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.6);
  animation: fbw-modal-in 0.2s cubic-bezier(0.34,1.1,0.64,1);
  max-height: 92vh;
  overflow-y: auto;
}
@keyframes fbw-modal-in {
  from { opacity: 0; transform: translateY(20px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@media (max-width: 479px) {
  .fbw-modal { border-radius: 18px 18px 0 0; max-width: 100%; padding: 20px 16px 28px; }
}

/* ── Header ──────────────────────────────────────────────────────────────── */
.fbw-modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.fbw-modal-title {
  display: flex; align-items: center; gap: 8px;
  font-family: 'Fraunces', serif; font-size: 20px; font-weight: 700; color: var(--text, #e8eaf0);
}
.fbw-close {
  display: flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; background: none; border: none; border-radius: 8px;
  color: var(--text-muted, #6b7280); font-size: 14px; cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.fbw-close:hover { background: rgba(255,255,255,0.07); color: var(--text); }
.fbw-modal-sub { font-size: 13px; color: var(--text-muted, #6b7280); line-height: 1.5; margin-bottom: 20px; }

/* ── Fields ──────────────────────────────────────────────────────────────── */
.fbw-field { margin-bottom: 16px; }
.fbw-label {
  display: block; font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.09em; color: var(--text-dim, #9ca3af); margin-bottom: 8px;
  font-family: 'DM Mono', monospace;
}
.fbw-required { color: #ef4444; }
.fbw-type-row { display: flex; flex-wrap: wrap; gap: 6px; }
.fbw-type-btn {
  padding: 6px 13px; border-radius: 50px;
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  background: var(--surface2, #1a1e27); color: var(--text-dim, #9ca3af);
  font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 500;
  cursor: pointer; transition: all 0.13s;
}
.fbw-type-btn:hover { border-color: rgba(91,141,238,0.3); color: var(--text); }
.fbw-type-active {
  background: rgba(91,141,238,0.15) !important;
  border-color: var(--accent, #5b8dee) !important;
  color: var(--accent, #5b8dee) !important;
  font-weight: 600 !important;
}
.fbw-textarea, .fbw-input {
  width: 100%; background: var(--surface2, #1a1e27);
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  border-radius: 10px; color: var(--text, #e8eaf0);
  font-family: 'Outfit', sans-serif; font-size: 13px; line-height: 1.6;
  padding: 10px 12px; outline: none; resize: vertical; transition: border-color 0.15s;
}
.fbw-textarea:focus, .fbw-input:focus { border-color: var(--accent, #5b8dee); }
.fbw-input { resize: none; min-height: 44px; }
.fbw-char-count { text-align: right; font-size: 11px; color: var(--text-muted, #6b7280); margin-top: 4px; font-family: 'DM Mono', monospace; }
.fbw-inline-toast { padding: 10px 14px; border-radius: 10px; font-size: 13px; font-weight: 600; margin-bottom: 14px; }
.fbw-toast-ok  { background: rgba(16,185,129,0.12); color: #10b981; border: 1px solid rgba(16,185,129,0.2); }
.fbw-toast-err { background: rgba(239,68,68,0.12);  color: #ef4444; border: 1px solid rgba(239,68,68,0.2); }
.fbw-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
.fbw-btn {
  display: inline-flex; align-items: center; justify-content: center;
  gap: 6px; padding: 10px 20px; min-height: 44px; border-radius: 10px;
  font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 600;
  cursor: pointer; border: 1px solid transparent; transition: background 0.13s, color 0.13s;
}
.fbw-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.fbw-btn-primary { background: var(--accent, #5b8dee); color: #fff; border-color: var(--accent, #5b8dee); }
.fbw-btn-primary:hover:not(:disabled) { background: color-mix(in srgb, var(--accent, #5b8dee) 82%, black); }
.fbw-btn-ghost { background: rgba(255,255,255,0.05); color: var(--text-muted, #6b7280); border-color: rgba(255,255,255,0.1); }
.fbw-btn-ghost:hover:not(:disabled) { background: rgba(255,255,255,0.1); color: var(--text); }
`;
