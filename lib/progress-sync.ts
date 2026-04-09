// lib/progress-sync.ts
// Low-level sync layer: localStorage-first writes + server upserts + offline queue.
//
// KEY DESIGN: flashcard_progress stores the SET of individual card IDs marked
// "got it", not just an aggregate %. This enables true cross-device merge:
// union of got_it sets = mastery across all devices combined.

const LS_PROGRESS_KEY = 'studymd_progress_v2';
const LS_QUEUE_KEY = 'studymd_sync_queue_v2';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ProgressRecord {
  internalId: string;
  flashcardProgress: {
    sessions: number;
    // Card IDs marked "got it" at least once, ever, across all devices.
    // Mastery % = got_it_ids.length / total_cards_in_lecture
    got_it_ids: string[];
    // Card IDs marked "still learning" in the most recent session.
    // Used to pre-mark cards on next session open.
    missed_ids: string[];
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
  id: string;
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
  } catch { /* Storage full — ignore */ }
}

// ── Progress store ────────────────────────────────────────────────────────────

export function readLocalProgress(): Record<string, ProgressRecord> {
  return readLS<Record<string, ProgressRecord>>(LS_PROGRESS_KEY, {});
}

function writeLocalProgress(data: Record<string, ProgressRecord>): void {
  writeLS(LS_PROGRESS_KEY, data);
}

// ── Merge two ProgressRecords ─────────────────────────────────────────────────
// The key insight: got_it_ids is a UNION across devices (additive).
// A card stays "got it" until explicitly marked "still learning" on any device.
// missed_ids uses the more recent session's data.

function mergeRecords(a: ProgressRecord, b: ProgressRecord): ProgressRecord {
  const aIsNewer = a.updatedAt >= b.updatedAt;
  const newer = aIsNewer ? a : b;
  const older = aIsNewer ? b : a;

  // Union of all got_it_ids ever seen across both records
  const mergedGotIt = Array.from(
    new Set([
      ...(a.flashcardProgress.got_it_ids ?? []),
      ...(b.flashcardProgress.got_it_ids ?? []),
    ])
  );

  // missed_ids: use the newer session's data (more recent study state)
  const mergedMissed = newer.flashcardProgress.missed_ids ?? [];

  // Remove any card from missed if it's in the merged got_it set
  // (a card marked "got it" on one device overrides "still learning" on another)
  const finalMissed = mergedMissed.filter((id) => !mergedGotIt.includes(id));

  return {
    internalId: newer.internalId,
    flashcardProgress: {
      sessions: Math.max(
        a.flashcardProgress.sessions ?? 0,
        b.flashcardProgress.sessions ?? 0
      ),
      got_it_ids: mergedGotIt,
      missed_ids: finalMissed,
    },
    examProgress: {
      sessions: Math.max(
        a.examProgress.sessions ?? 0,
        b.examProgress.sessions ?? 0
      ),
      best_score:
        a.examProgress.best_score !== null && b.examProgress.best_score !== null
          ? Math.max(a.examProgress.best_score, b.examProgress.best_score)
          : a.examProgress.best_score ?? b.examProgress.best_score,
      avg_score: newer.examProgress.avg_score,
    },
    lastStudied: newer.lastStudied,
    updatedAt: newer.updatedAt,
  };
}

// ── Offline queue ─────────────────────────────────────────────────────────────

function readQueue(): QueueItem[] {
  return readLS<QueueItem[]>(LS_QUEUE_KEY, []);
}

function writeQueue(queue: QueueItem[]): void {
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

// ── save() ────────────────────────────────────────────────────────────────────

export function save(record: ProgressRecord): void {
  const local = readLocalProgress();
  const existing = local[record.internalId];

  // Merge with existing local record (union of got_it_ids) rather than overwrite
  const merged = existing ? mergeRecords(existing, record) : record;
  local[record.internalId] = merged;
  writeLocalProgress(local);

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    enqueue({
      internalId: merged.internalId,
      flashcardProgress: merged.flashcardProgress,
      examProgress: merged.examProgress,
      lastStudied: merged.lastStudied ?? merged.updatedAt,
    });
    return;
  }

  void pushToServer({
    internalId: merged.internalId,
    flashcardProgress: merged.flashcardProgress,
    examProgress: merged.examProgress,
    lastStudied: merged.lastStudied ?? merged.updatedAt,
  }).catch(() => {
    enqueue({
      internalId: merged.internalId,
      flashcardProgress: merged.flashcardProgress,
      examProgress: merged.examProgress,
      lastStudied: merged.lastStudied ?? merged.updatedAt,
    });
  });
}

// ── loadAll() ────────────────────────────────────────────────────────────────

export async function loadAll(): Promise<Record<string, ProgressRecord>> {
  const local = readLocalProgress();

  try {
    const res = await fetch('/api/progress/load', { credentials: 'include' });
    if (!res.ok) return local;

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
      const serverRecord: ProgressRecord = {
        internalId: row.internalId,
        flashcardProgress: {
          sessions: row.flashcardProgress?.sessions ?? 0,
          got_it_ids: row.flashcardProgress?.got_it_ids ?? [],
          missed_ids: row.flashcardProgress?.missed_ids ?? [],
        },
        examProgress: {
          sessions: row.examProgress?.sessions ?? 0,
          best_score: row.examProgress?.best_score ?? null,
          avg_score: row.examProgress?.avg_score ?? null,
        },
        lastStudied: row.lastStudied,
        updatedAt: row.updatedAt,
      };

      const localRow = local[row.internalId];
      // Merge (union of got_it_ids) rather than just picking the newer one
      merged[row.internalId] = localRow
        ? mergeRecords(localRow, serverRecord)
        : serverRecord;
    }

    writeLocalProgress(merged);
    return merged;
  } catch {
    return local;
  }
}

// ── flushQueue() ──────────────────────────────────────────────────────────────

export async function flushQueue(): Promise<void> {
  const queue = readQueue();
  if (queue.length === 0) return;

  const remaining: QueueItem[] = [];
  for (const item of queue) {
    try {
      await pushToServer(item);
    } catch {
      remaining.push({ ...item, attempts: item.attempts + 1 });
    }
  }
  writeQueue(remaining);
}

// ── pushToServer() ────────────────────────────────────────────────────────────

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
    let errBody = '';
    try { errBody = await res.text(); } catch { /* ignore */ }
    console.error(`[progress-sync] save failed ${res.status}:`, errBody);
    throw new Error(`progress/save ${res.status}: ${errBody}`);
  }
}

// ── setupOnlineListener() ─────────────────────────────────────────────────────

let listenerAttached = false;

export function setupOnlineListener(): void {
  if (typeof window === 'undefined' || listenerAttached) return;
  listenerAttached = true;
  window.addEventListener('online', () => { void flushQueue(); });
}
