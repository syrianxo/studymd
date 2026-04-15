// components/CustomSessionModal.tsx
'use client';

import { useState, useEffect } from 'react';
import type { Lecture } from '@/hooks/useUserLectures';

type SessionMode = 'flash' | 'exam';

interface CustomSessionConfig {
  mode: SessionMode;
  lectureIds: string[];
  topics: string[];
  count: number;
  questionTypes: string[];
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

  useEffect(() => {
    if (isOpen) {
      const prevOverflow = document.body.style.overflow;
      const prevPosition = document.body.style.position;
      const prevWidth = document.body.style.width;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      return () => {
        document.body.style.overflow = prevOverflow;
        document.body.style.position = prevPosition;
        document.body.style.width = prevWidth;
      };
    }
  }, [isOpen]);

  const availableTopics = Array.from(new Set(lectures.filter(l => selectedLectureIds.has(l.internal_id)).flatMap(l => l.topics))).sort();

  useEffect(() => {
    setSelectedTopics(new Set(availableTopics));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLectureIds]);

  function toggleLecture(id: string) { setSelectedLectureIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function toggleTopic(t: string)   { setSelectedTopics(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; }); }
  function toggleType(t: string)    { setSelectedTypes(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; }); }
  function selectAll() { selectedLectureIds.size === lectures.length ? setSelectedLectureIds(new Set()) : setSelectedLectureIds(new Set(lectures.map(l => l.internal_id))); }
  function handleStart() { if (selectedLectureIds.size === 0) return; onStart({ mode, lectureIds: Array.from(selectedLectureIds), topics: Array.from(selectedTopics), count, questionTypes: Array.from(selectedTypes) }); }

  return (
    <>
      <style>{modalExtraCss}</style>
      <div className={`smd-modal-overlay${isOpen ? ' active' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="smd-modal" style={{ maxWidth: 640 }}>
          <div className="smd-modal-topbar">
            <div className="smd-modal-drag-handle" />
            <button className="smd-modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>
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
              <button className="smd-select-all-btn" onClick={selectAll}>{selectedLectureIds.size === lectures.length ? 'Deselect all' : 'Select all'}</button>
            </div>
            <div className="smd-lecture-select-grid">
              {lectures.map(l => (
                <div key={l.internal_id} className={`smd-lecture-select-item${selectedLectureIds.has(l.internal_id) ? ' selected' : ''}`} onClick={() => toggleLecture(l.internal_id)}>
                  <span>{l.icon}</span>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</span>
                </div>
              ))}
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
          <div className="smd-modal-actions">
            <button className="btn btn-primary btn-lg" onClick={handleStart} disabled={selectedLectureIds.size === 0} style={{ opacity: selectedLectureIds.size === 0 ? 0.5 : 1 }}>Start Session →</button>
            <button className="btn btn-ghost btn-lg" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </>
  );
}

const modalExtraCss = `
.smd-modal-topbar {
  position: sticky; top: 0; z-index: 10;
  display: flex; align-items: center; justify-content: center;
  padding: 10px 16px 6px; margin: -20px -20px 0;
  background: var(--surface, #13161d);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  border-radius: 20px 20px 0 0;
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
`;

export type { CustomSessionConfig };
