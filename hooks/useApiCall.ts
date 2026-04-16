// hooks/useApiCall.ts
// Wrapper around fetch that:
//   - Catches network & HTTP errors
//   - Shows a user-friendly toast on failure (via ToastProvider)
//   - Logs full error to console for debugging
//
// Usage:
//   const { apiCall, loading, error } = useApiCall();
//   const data = await apiCall('/api/lectures', { method: 'GET' });
'use client';

import { useState, useCallback } from 'react';
import { useToast } from '@/components/Toast';

interface UseApiCallOptions {
  /** Override the default error message shown in the toast */
  errorMessage?: string;
  /** Suppress the toast on error (you handle it yourself) */
  silent?: boolean;
}

interface UseApiCallResult {
  apiCall: <T = unknown>(
    url: string,
    init?: RequestInit,
    opts?: UseApiCallOptions,
  ) => Promise<T | null>;
  loading: boolean;
  error: string | null;
  clearError: () => void;
}

export function useApiCall(): UseApiCallResult {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiCall = useCallback(
    async <T = unknown>(
      url: string,
      init?: RequestInit,
      opts: UseApiCallOptions = {},
    ): Promise<T | null> => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(url, init);

        if (!res.ok) {
          let message = `Request failed (${res.status})`;
          try {
            const body = await res.json();
            if (body?.error) message = body.error;
            else if (body?.message) message = body.message;
          } catch {
            if (res.status === 401) message = 'You must be signed in.';
            else if (res.status === 403) message = 'You do not have permission to do that.';
            else if (res.status === 404) message = 'Resource not found.';
            else if (res.status >= 500) message = 'Server error. Please try again later.';
          }

          const displayMsg = opts.errorMessage ?? message;
          setError(displayMsg);
          if (!opts.silent) toast(displayMsg, 'err');
          console.error(`[StudyMD API] ${res.status} ${url}:`, message);
          return null;
        }

        if (res.status === 204) return {} as T;

        const data = await res.json();
        return data as T;
      } catch (err: any) {
        const message = err?.message ?? 'Network error. Check your connection.';
        const displayMsg = opts.errorMessage ?? message;
        setError(displayMsg);
        if (!opts.silent) toast(displayMsg, 'err');
        console.error(`[StudyMD API] Network error ${url}:`, err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  const clearError = useCallback(() => setError(null), []);

  return { apiCall, loading, error, clearError };
}
