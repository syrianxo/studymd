// lib/progress-sync.ts
// Low-level sync layer: localStorage-first writes + server upserts + offline queue.
// Used by hooks/useProgress.ts. Never import directly into components.

const LS_PROGRESS_KEY = 'studymd_progress_v2';
const LS_QUEUE_KEY = 'studymd_sync_queue_v2';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ProgressRecord {
  internalId: string;
  flashcardProgress: {
    sessions: number;
    mastery_pct: number;
  };
  examProgress: {
    sessions: number;
    best_score: number | null;
    avg_score: number | null;
  };
  lastStudied: string | null;
  updatedAt: string;
}

interface QueueItem {
  id: string;           // random id for dedup
  internalId: string;
  flashcardProgress?: ProgressRecord['flashcardProgress'];
  examProgress?: ProgressRecord['examProgress'];
  lastStudied: string;
  enqueuedAt: string;
  attempts: number;
}

// ── localStorage helpers ──────────────────────────────────────────────────────

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full — silently ignore
  }
}

// ── Progress store (localStorage) ────────────────────────────────────────────

export function readLocalProgress(): Record<string, ProgressRecord> {
  return readLS<Record<string, ProgressRecord>>(LS_PROGRESS_KEY, {});
}

function writeLocalProgress(data: Record<string, ProgressRecord>): void {
  writeLS(LS_PROGRESS_KEY, data);
}

// ── Offline queue ─────────────────────────────────────────────────────────────

function readQueue(): QueueItem[] {
  return readLS<QueueItem[]>(LS_QUEUE_KEY, []);
}

function writeQueue(queue: QueueItem[]): void {
  // Keep only the 50 most recent items to cap storage use
  writeLS(LS_QUEUE_KEY, queue.slice(-50));
}

function enqueue(item: Omit<QueueItem, 'id' | 'enqueuedAt' | 'attempts'>): void {
  const queue = readQueue();
  queue.push({
    ...item,
    id: Math.random().toString(36).slice(2),
    enqueuedAt: new Date().toISOString(),
    attempts: 0,
  });
  writeQueue(queue);
}

// ── save() ───────────────────────────────────────────────────────────────────
// Write to localStorage immediately, then fire-and-forget to the API.
// If offline, enqueue for later retry.

export function save(record: ProgressRecord): void {
  // 1. Write to localStorage immediately (last-write-wins by updatedAt)
  const local = readLocalProgress();
  const existing = local[record.internalId];

  if (existing && existing.updatedAt > record.updatedAt) {
    return; // existing is newer — don't overwrite
  }

  local[record.internalId] = record;
  writeLocalProgress(local);

  // 2. Try server; fall back to queue if offline
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    enqueue({
      internalId: record.internalId,
      flashcardProgress: record.flashcardProgress,
      examProgress: record.examProgress,
      lastStudied: record.lastStudied ?? record.updatedAt,
    });
    return;
  }

  // Fire-and-forget — queue on failure
  void pushToServer({
    internalId: record.internalId,
    flashcardProgress: record.flashcardProgress,
    examProgress: record.examProgress,
    lastStudied: record.lastStudied ?? record.updatedAt,
  }).catch(() => {
    enqueue({
      internalId: record.internalId,
      flashcardProgress: record.flashcardProgress,
      examProgress: record.examProgress,
      lastStudied: record.lastStudied ?? record.updatedAt,
    });
  });
}

// ── loadAll() ────────────────────────────────────────────────────────────────
// Fetch from server, merge with local (newer wins by updatedAt), update localStorage.
// Returns the merged map for React state.

export async function loadAll(): Promise<Record<string, ProgressRecord>> {
  const local = readLocalProgress();

  try {
    const res = await fetch('/api/progress/load', { credentials: 'include' });
    if (!res.ok) {
      // Not authenticated or server error — return local only
      return local;
    }

    const json = await res.json() as {
      progress: Array<{
        internalId: string;
        flashcardProgress: ProgressRecord['flashcardProgress'];
        examProgress: ProgressRecord['examProgress'];
        lastStudied: string | null;
        updatedAt: string;
      }>;
    };

    const merged: Record<string, ProgressRecord> = { ...local };

    for (const row of json.progress ?? []) {
      const localRow = local[row.internalId];
      // Server wins if it's newer than local (or no local row exists)
      if (!localRow || row.updatedAt > localRow.updatedAt) {
        merged[row.internalId] = {
          internalId: row.internalId,
          flashcardProgress: row.flashcardProgress,
          examProgress: row.examProgress,
          lastStudied: row.lastStudied,
          updatedAt: row.updatedAt,
        };
      }
    }

    // Persist merged result back to localStorage
    writeLocalProgress(merged);
    return merged;
  } catch {
    // Network unavailable — return local cache
    return local;
  }
}

// ── flushQueue() ──────────────────────────────────────────────────────────────
// Retry all queued writes. Called when navigator.onLine fires true.

export async function flushQueue(): Promise<void> {
  const queue = readQueue();
  if (queue.length === 0) return;

  const remaining: QueueItem[] = [];

  for (const item of queue) {
    try {
      await pushToServer(item);
      // Success — don't keep in queue
    } catch {
      // Failed again — keep, bump attempt count
      remaining.push({ ...item, attempts: item.attempts + 1 });
    }
  }

  writeQueue(remaining);
}

// ── pushToServer() ────────────────────────────────────────────────────────────
// Internal: POST to the API route. Throws on non-OK response.

async function pushToServer(payload: {
  internalId: string;
  flashcardProgress?: ProgressRecord['flashcardProgress'];
  examProgress?: ProgressRecord['examProgress'];
  lastStudied?: string;
}): Promise<void> {
  const res = await fetch('/api/progress/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`progress/save returned ${res.status}`);
  }
}

// ── setupOnlineListener() ─────────────────────────────────────────────────────
// Call once at app startup. Flushes the queue when the browser comes back online.

let listenerAttached = false;

export function setupOnlineListener(): void {
  if (typeof window === 'undefined' || listenerAttached) return;
  listenerAttached = true;
  window.addEventListener('online', () => {
    void flushQueue();
  });
}
