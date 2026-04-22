// components/CustomSessionModal.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Lecture } from '@/hooks/useUserLectures';
import { useModalShell } from '@/hooks/useModalShell';
import { useFolders } from '@/hooks/useFolders';

type SessionMode = 'flash' | 'exam';
type CardMode = 'all' | 'new' | 'missed';
type QuestionMode = 'all' | 'new' | 'missed';

interface CustomSessionConfig {
  mode: SessionMode;
  lectureIds: string[];
  topics: string[];
  count: number;
  questionTypes: string[];
  cardMode: CardMode;
  questionMode: QuestionMode;
}

interface CustomSessionModalProps {
  isOpen: boolean;
  lectures: Lecture[];
  onClose: () => void;
  onStart: (config: CustomSessionConfig) => void;
}

const ALL_QUESTION_TYPES = ['mcq', 'tf', 'matching', 'fillin'];
const TYPE_LABELS: Record<string, string> = {
  mcq: 'Multiple Choice',
  tf: 'True / False',
  matching: 'Matching',
  fillin: 'Fill in the Blank',
};

export default function CustomSessionModal({ isOpen, lectures, onClose, onStart }: CustomSessionModalProps) {
  const [mode, setMode] = useState<SessionMode>('flash');
  const [selectedLectureIds, setSelectedLectureIds] = useState<Set<string>>(new Set());
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(20);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set(ALL_QUESTION_TYPES));
  const [folderFilter, setFolderFilter] = useState<string>('');  // '' = all, uuid = folder
  const [cardMode, setCardMode] = useState<CardMode>('all');
  const [questionMode, setQuestionMode] = useState<QuestionMode>('new');

  useModalShell(isOpen);

  const { folders } = useFolders();

  // Lectures visible in the picker (filtered by folder if one is selected)
  const pickerLectures = useMemo(() => {
    if (!folderFilter) return lectures.filter(l => l.visible && !l.archived);
    return lectures.filter(l => l.visible && !l.archived && (l.group_id ?? null) === folderFilter);
  }, [lectures, folderFilter]);

  const availableTopics = Array.from(new Set(pickerLectures.filter(l => selectedLectureIds.has(l.internal_id)).flatMap(l => l.topics))).sort();

  useEffect(() => {
    setSelectedTopics(new Set(availableTopics));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLectureIds]);

  function toggleLecture(id: string) { setSelectedLectureIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function toggleTopic(t: string)   { setSelectedTopics(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; }); }
  function toggleType(t: string)    { setSelectedTypes(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; }); }
  function selectAll() {
    const allInPicker = pickerLectures.map(l => l.internal_id);
    const allSelected = allInPicker.every(id => selectedLectureIds.has(id));
    if (allSelected) {
      setSelectedLectureIds(prev => { const n = new Set(prev); allInPicker.forEach(id => n.delete(id)); return n; });
    } else {
      setSelectedLectureIds(prev => new Set([...prev, ...allInPicker]));
    }
  }
  function handleStart() { if (selectedLectureIds.size === 0) return; onStart({ mode, lectureIds: Array.from(selectedLectureIds), topics: Array.from(selectedTopics), count, questionTypes: Array.from(selectedTypes), cardMode, questionMode }); }

  return (
    <>
      <style>{modalExtraCss}</style>
      <div className={`smd-modal-overlay${isOpen ? ' active' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="smd-modal" style={{ maxWidth: 640 }}>
          <div className="smd-modal-topbar">
            <div className="smd-modal-drag-handle" />
            <button className="smd-modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <div className="smd-modal-body">
            <div className="smd-modal-title">✦ Custom Study Session</div>
            <div className="smd-modal-subtitle">Mix lectures, build your own deck or exam.</div>
            <div className="smd-form-group">
              <label className="smd-form-label">Session type</label>
              <div className="smd-custom-mode-tabs">
                <div className={`smd-custom-mode-tab${mode === 'flash' ? ' active' : ''}`} onClick={() => setMode('flash')}>📇 Flashcards</div>
                <div className={`smd-custom-mode-tab${mode === 'exam' ? ' active' : ''}`} onClick={() => setMode('exam')}>📝 Practice Exam</div>
              </div>
            </div>
            <div className="smd-form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label className="smd-form-label" style={{ margin: 0 }}>Select lectures</label>
                <button className="smd-select-all-btn" onClick={selectAll}>
                  {pickerLectures.every(l => selectedLectureIds.has(l.internal_id)) && pickerLectures.length > 0 ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              {/* Folder filter — only show when there are folders */}
              {folders.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <select
                    className="smd-folder-filter-select"
                    value={folderFilter}
                    onChange={e => setFolderFilter(e.target.value)}
                  >
                    <option value="">All lectures</option>
                    {folders.map(f => (
                      <option key={f.id} value={f.id}>{f.icon} {f.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="smd-lecture-select-grid">
                {pickerLectures.map(l => (
                  <div key={l.internal_id} className={`smd-lecture-select-item${selectedLectureIds.has(l.internal_id) ? ' selected' : ''}`} onClick={() => toggleLecture(l.internal_id)}>
                    <span>{l.icon}</span>
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</span>
                  </div>
                ))}
                {pickerLectures.length === 0 && (
                  <div style={{ gridColumn: '1/-1', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '12px 0' }}>
                    No lectures in this folder
                  </div>
                )}
              </div>
            </div>
            {availableTopics.length > 0 && (
              <div className="smd-form-group">
                <label className="smd-form-label">Topics to include <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(from selected lectures)</span></label>
                <div className="smd-topic-selector">
                  {availableTopics.map(t => <div key={t} className={`smd-topic-toggle${selectedTopics.has(t) ? ' selected' : ''}`} onClick={() => toggleTopic(t)}>{t}</div>)}
                </div>
              </div>
            )}
            {/* Card / question pool mode */}
            <div className="smd-form-group">
              <label className="smd-form-label">{mode === 'flash' ? 'Card pool' : 'Question pool'}</label>
              <div className="smd-mode-tabs">
                {mode === 'flash' ? (
                  <>
                    {(['all', 'new', 'missed'] as CardMode[]).map((m) => (
                      <div key={m} className={`smd-mode-tab${cardMode === m ? ' active' : ''}`} onClick={() => setCardMode(m)}>
                        {m === 'all' ? '📚 All cards' : m === 'new' ? '✨ New only' : '🔁 Missed only'}
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    {(['all', 'new', 'missed'] as QuestionMode[]).map((m) => (
                      <div key={m} className={`smd-mode-tab${questionMode === m ? ' active' : ''}`} onClick={() => setQuestionMode(m)}>
                        {m === 'all' ? '📚 All' : m === 'new' ? '✨ New only' : '🔁 Missed only'}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
            <div className="smd-form-group">
              <label className="smd-form-label" id="custom-count-label">{mode === 'flash' ? 'Number of cards' : 'Number of questions'}</label>
              <input type="range" className="smd-form-range" min={5} max={50} step={1} value={count} onChange={e => setCount(Number(e.target.value))} aria-labelledby="custom-count-label" />
              <div className="smd-range-display">{count} {mode === 'flash' ? 'cards' : 'questions'}</div>
            </div>
            {mode === 'exam' && (
              <div className="smd-form-group">
                <label className="smd-form-label">Question types</label>
                <div className="smd-topic-selector">
                  {ALL_QUESTION_TYPES.map(t => <div key={t} className={`smd-topic-toggle${selectedTypes.has(t) ? ' selected' : ''}`} onClick={() => toggleType(t)}>{TYPE_LABELS[t]}</div>)}
                </div>
              </div>
            )}
          </div>
          <div className="smd-modal-footer">
            <button className="btn btn-primary btn-lg" onClick={handleStart} disabled={selectedLectureIds.size === 0} style={{ opacity: selectedLectureIds.size === 0 ? 0.5 : 1 }}>Start Session →</button>
            <button className="btn btn-ghost btn-lg" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </>
  );
}

const modalExtraCss = `
/* Flex layout: topbar + scrollable body + footer — avoids sticky positioning bugs on iOS */
.smd-modal {
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
}
.smd-modal-topbar {
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  padding: 10px 16px 6px;
  background: var(--surface, #13161d);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  border-radius: 20px 20px 0 0;
}
.smd-modal-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 20px 20px 4px;
}
.smd-modal-close-btn {
  position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
  width: 44px; height: 44px; min-width: 44px; min-height: 44px;
  background: none; border: none; border-radius: 10px;
  color: var(--text-muted, #6b7280); font-size: 16px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, color 0.15s;
}
.smd-modal-close-btn:hover { background: rgba(255,255,255,0.07); color: var(--text, #e8eaf0); }
.smd-modal-topbar .smd-modal-drag-handle { margin: 0; }
.smd-modal-footer {
  flex-shrink: 0;
  padding: 12px 20px max(env(safe-area-inset-bottom, 0px), 16px);
  background: var(--surface, #13161d);
  border-top: 1px solid rgba(255,255,255,0.06);
  display: flex; gap: 10px; align-items: center;
}
.smd-mode-tabs {
  display: flex; gap: 6px; flex-wrap: wrap;
}
.smd-mode-tab {
  flex: 1; min-width: 80px;
  padding: 8px 10px; border-radius: 8px; cursor: pointer;
  border: 1.5px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
  font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 500;
  color: var(--text-muted, #6b7280); text-align: center;
  transition: all 0.15s; user-select: none; min-height: 36px;
  display: flex; align-items: center; justify-content: center;
}
.smd-mode-tab:hover { border-color: rgba(255,255,255,0.18); color: var(--text, #e8eaf0); }
.smd-mode-tab.active {
  border-color: var(--accent, #5b8dee);
  background: rgba(91,141,238,0.1);
  color: var(--accent, #5b8dee);
}
.smd-folder-filter-select {
  width: 100%;
  padding: 7px 10px;
  background: var(--surface2, rgba(255,255,255,.04));
  border: 1px solid var(--border, rgba(255,255,255,.1));
  border-radius: 8px;
  color: var(--text, #e8eaf0);
  font-size: 13px;
  cursor: pointer;
  appearance: auto;
}
.smd-folder-filter-select:focus { outline: none; border-color: var(--accent); }
`;

export type { CustomSessionConfig };
