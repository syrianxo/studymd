// components/study/ToastContainer.tsx
'use client';

import type { Toast } from '@/hooks/useToast';

interface ToastContainerProps {
  toasts: Toast[];
}

const VARIANT_COLORS: Record<NonNullable<Toast['variant']>, string> = {
  default: 'var(--text)',
  success: 'var(--success)',
  error: 'var(--danger)',
};

export default function ToastContainer({ toasts }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="smd-toast-container">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="smd-toast"
          style={{ color: VARIANT_COLORS[t.variant ?? 'default'] }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
