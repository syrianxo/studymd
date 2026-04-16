// components/Toast.tsx
// Global toast notification system.
// - Provides <ToastProvider> and useToast() hook.
// - Shows stacked toasts (bottom-center) with auto-dismiss.
// - Types: 'ok' (green), 'err' (red), 'info' (accent blue)
//
// Usage:
//   const { toast } = useToast();
//   toast('Saved!', 'ok');
//   toast('Something went wrong', 'err');
'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

export type ToastType = 'ok' | 'err' | 'info';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <style>{css}</style>
      <div className="smd-toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`smd-toast smd-toast-${t.type}`}
            role="status"
          >
            <span className="smd-toast-icon">
              {t.type === 'ok' ? '✓' : t.type === 'err' ? '⚠' : 'ℹ'}
            </span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ── Scoped CSS ────────────────────────────────────────────────────────────────
const css = `
.smd-toast-stack {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  pointer-events: none;
}
.smd-toast {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 22px;
  border-radius: 100px;
  font-family: 'Outfit', sans-serif;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  white-space: nowrap;
  animation: smd-toast-in 0.2s cubic-bezier(0.34,1.1,0.64,1);
  pointer-events: auto;
}
@keyframes smd-toast-in {
  from { opacity: 0; transform: translateY(10px) scale(0.95); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.smd-toast-ok   { background: #10b981; color: #fff; }
.smd-toast-err  { background: #ef4444; color: #fff; }
.smd-toast-info { background: var(--accent, #5b8dee); color: #fff; }
.smd-toast-icon { font-size: 13px; }
`;
