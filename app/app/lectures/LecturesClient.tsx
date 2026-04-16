'use client';
/**
 * app/app/lectures/LecturesClient.tsx — v4
 *
 * Fixes in this version:
 * 1. General Info grid: 3-column layout [auto 1fr 1fr] eliminates awkward spacing.
 * 2. Icon picker: position:fixed coords use viewport-only (no scrollY), plus
 *    viewport edge clamping so it never goes off-screen.
 * 3. Exam question modal crash: modal state lifted to LecturesClient level.
 *    Modals rendered as siblings of <table>, completely outside any <td>/<tr>.
 * 4. Slides: added public URL fallback + error display for missing service key.
 * 5. Header: uses the real Header component (with gear/settings/theme picker).
 *    userId fetched client-side with createClient().
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import Link from 'next/link';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase';
import type { Theme } from '@/types';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS as dndCSS } from '@dnd-kit/utilities';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LectureSummary {
  id: string;
  title: string;
  subtitle: string;
  course: string;
  color: string;
  icon: string;
  slideCount: number;
  flashcardCount: number;
  questionCount: number;
  createdAt: string;
  tags: string[];
  groupId: string | null;
  customTitle: string | null;
  displayOrder: number;
}

interface Flashcard {
  id: string;
  topic: string;
  slideNumber: number | null;
  question: string;
  answer: string;
  hasUserEdit: boolean;
  hasConflict: boolean;
  canonical?: { question: string; answer: string };
  userEditedAt: string | null;
}

interface ExamQuestion {
  id: string;
  type: string;
  topic: string;
  slideNumber: number | null;
  question: string;
  correctAnswer: string;
  options: string[];
  explanation: string;
  hasUserEdit: boolean;
  hasConflict: boolean;
  canonical?: { question: string; correctAnswer: string; options: string[]; explanation: string };
  userEditedAt: string | null;
}

interface SlideItem {
  name: string;
  slideNumber: number | null;
  url: string | null;
  size: number;
}

interface LectureDetail {
  lecture: LectureSummary;
  flashcards: Flashcard[];
  questions: ExamQuestion[];
  conflictCount: number;
}

type TabId = 'info' | 'flashcards' | 'questions' | 'slides';

// Modal state held at the top level so it never lives inside <tr>/<td>
type ModalState =
  | { kind: 'edit-fc'; lectureId: string; card: Flashcard }
  | { kind: 'edit-q';  lectureId: string; question: ExamQuestion }
  | { kind: 'add-fc';  lectureId: string }
  | { kind: 'add-q';   lectureId: string }
  | null;

// ─── Constants ────────────────────────────────────────────────────────────────

const COURSES = ['Physical Diagnosis I', 'Anatomy & Physiology', 'Laboratory Diagnosis'];

const COURSE_COLORS: Record<string, string> = {
  'Physical Diagnosis I': '#5b8dee',
  'Anatomy & Physiology': '#10b981',
  'Laboratory Diagnosis': '#8b5cf6',
};

const TYPE_LABELS: Record<string, string> = {
  mcq: 'Multiple Choice', tf: 'True / False', matching: 'Matching', fillin: 'Fill in the Blank',
};

const PRESET_COLORS = [
  '#5b8dee','#3b82f6','#06b6d4','#10b981','#84cc16',
  '#f59e0b','#f97316','#ef4444','#ec4899','#8b5cf6',
  '#a78bfa','#6366f1','#14b8a6','#e2e8f0','#94a3b8',
];

const ICON_OPTIONS = [
  '🫀','🫁','🧠','🦷','🦴','🩺','💉','🩸','🧬','🔬',
  '📋','📊','📈','🧪','⚕️','🏥','💊','🩻','👁️','👂',
  '🫃','🤕','🩹','🧫','🧑‍⚕️','📚','📖','✏️','🗒️','📝',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(path, opts);
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error ?? `HTTP ${r.status}`);
  }
  return r.json();
}

// ─── Portal ───────────────────────────────────────────────────────────────────

function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); return () => setMounted(false); }, []);
  if (!mounted) return null;
  return ReactDOM.createPortal(children, document.body);
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, type, onDone }: { msg: string; type: 'ok' | 'err'; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  return (
    <Portal>
      <div className={`lm-toast lm-toast-${type}`}>{msg}</div>
    </Portal>
  );
}

// ─── Icon Picker ──────────────────────────────────────────────────────────────
// Uses viewport-relative position (no scrollY) for position:fixed.
// Clamps to viewport edges.

function IconPicker({ current, anchorRef, onSelect, onClose }: {
  current: string;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onSelect: (icon: string) => void;
  onClose: () => void;
}) {
  const PICKER_W = 252;
  const PICKER_H = 220; // approx
  const [style, setStyle] = useState<React.CSSProperties>({ top: -9999, left: -9999, opacity: 0 });

  useEffect(() => {
    if (!anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Prefer below button; flip above if not enough room
    let top = r.bottom + 8;
    if (top + PICKER_H > vh - 8) top = Math.max(8, r.top - PICKER_H - 8);
    // Prefer left-aligned; clamp to right edge
    let left = r.left;
    if (left + PICKER_W > vw - 8) left = Math.max(8, vw - PICKER_W - 8);
    setStyle({ top, left, opacity: 1 });
  }, [anchorRef]);

  return (
    <Portal>
      <div className="lm-icon-picker-backdrop" onClick={onClose} />
      <div className="lm-icon-picker" style={style}>
        <div className="lm-icon-picker-title">Choose an Icon</div>
        <div className="lm-icon-grid">
          {ICON_OPTIONS.map(icon => (
            <button key={icon}
              className={`lm-icon-opt ${icon === current ? 'lm-icon-opt-selected' : ''}`}
              onClick={() => { onSelect(icon); onClose(); }}>
              {icon}
            </button>
          ))}
        </div>
      </div>
    </Portal>
  );
}

// ─── Conflict Banner ──────────────────────────────────────────────────────────

function ConflictBanner({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div className="lm-conflict-banner">
      <span>⚠️</span>
      <span><strong>{count} card{count !== 1 ? 's' : ''}</strong> updated by your instructor. Review flagged cards below.</span>
    </div>
  );
}

// ─── Flashcard Edit Modal ─────────────────────────────────────────────────────

function FlashcardEditModal({ card, lectureId, onSave, onClose }: {
  card: Flashcard; lectureId: string; onSave: (updated: Flashcard) => void; onClose: () => void;
}) {
  const [q, setQ] = useState(card.question);
  const [a, setA] = useState(card.answer);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!q.trim() || !a.trim()) { setErr('Question and answer are required.'); return; }
    setSaving(true);
    try {
      await apiFetch(`/api/lectures/${lectureId}/flashcards/${card.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q.trim(), answer: a.trim() }),
      });
      onSave({ ...card, question: q.trim(), answer: a.trim(), hasUserEdit: true });
      onClose();
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  }

  async function acceptCanonical() {
    setSaving(true);
    try {
      await apiFetch(`/api/lectures/${lectureId}/flashcards/${card.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceptCanonical: true }),
      });
      onSave({ ...card, question: card.canonical?.question ?? card.question, answer: card.canonical?.answer ?? card.answer, hasUserEdit: false, hasConflict: false, canonical: undefined });
      onClose();
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  }

  async function revertToCanonical() {
    setSaving(true);
    try {
      await apiFetch(`/api/lectures/${lectureId}/flashcards/${card.id}`, { method: 'DELETE' });
      onSave({ ...card, hasUserEdit: false, hasConflict: false, canonical: undefined });
      onClose();
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  }

  return (
    <Portal>
      <div className="lm-overlay" onClick={onClose}>
        <div className="lm-modal" onClick={e => e.stopPropagation()}>
          <div className="lm-modal-header">
            <div>
              <div className="lm-modal-title">Edit Flashcard</div>
              <div className="lm-modal-sub">Your edits are personal and won't affect other students.</div>
            </div>
            <button className="lm-modal-close" onClick={onClose}>✕</button>
          </div>
          {card.hasConflict && card.canonical && (
            <div className="lm-conflict-card">
              <div className="lm-conflict-card-title">⚠️ Your instructor updated this card</div>
              <div className="lm-conflict-versions">
                <div className="lm-conflict-col">
                  <div className="lm-conflict-col-label">Instructor's version</div>
                  <div className="lm-conflict-text">{card.canonical.question}</div>
                  <div className="lm-conflict-answer">{card.canonical.answer}</div>
                </div>
                <div className="lm-conflict-col">
                  <div className="lm-conflict-col-label">Your version</div>
                  <div className="lm-conflict-text">{card.question}</div>
                  <div className="lm-conflict-answer">{card.answer}</div>
                </div>
              </div>
              <div className="lm-conflict-actions">
                <button className="lm-btn lm-btn-primary" onClick={acceptCanonical} disabled={saving}>✓ Accept instructor's version</button>
                <span className="lm-conflict-or">or keep editing yours below</span>
              </div>
            </div>
          )}
          <div className="lm-form-field">
            <label className="lm-form-label">Question</label>
            <textarea className="lm-textarea" rows={3} value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div className="lm-form-field">
            <label className="lm-form-label">Answer</label>
            <textarea className="lm-textarea" rows={4} value={a} onChange={e => setA(e.target.value)} />
          </div>
          {card.hasUserEdit && !card.hasConflict && (
            <div className="lm-revert-row">
              <span className="lm-edit-badge">✏️ You've edited this card</span>
              <button className="lm-btn lm-btn-ghost lm-btn-sm" onClick={revertToCanonical} disabled={saving}>Revert to original</button>
            </div>
          )}
          {err && <div className="lm-err">{err}</div>}
          <div className="lm-modal-footer">
            <button className="lm-btn lm-btn-ghost" onClick={onClose}>Cancel</button>
            <button className="lm-btn lm-btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save My Edit'}</button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// ─── Question Edit Modal ──────────────────────────────────────────────────────

function QuestionEditModal({ question, lectureId, onSave, onClose }: {
  question: ExamQuestion; lectureId: string; onSave: (updated: ExamQuestion) => void; onClose: () => void;
}) {
  const [q, setQ] = useState(question.question);
  const [ca, setCa] = useState(question.correctAnswer);
  const [options, setOptions] = useState<string[]>(
    question.options?.length ? question.options : question.type === 'tf' ? ['True', 'False'] : []
  );
  const [exp, setExp] = useState(question.explanation ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [editingAnswerIdx, setEditingAnswerIdx] = useState<number | null>(null);
  const [editingCorrect, setEditingCorrect] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(false);
  const [editingExplanation, setEditingExplanation] = useState(false);

  async function save() {
    if (!q.trim() || !ca.trim()) { setErr('Question and correct answer are required.'); return; }
    setSaving(true);
    try {
      await apiFetch(`/api/lectures/${lectureId}/questions/${question.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q.trim(), correctAnswer: ca.trim(), explanation: exp.trim() }),
      });
      onSave({ ...question, question: q.trim(), correctAnswer: ca.trim(), explanation: exp.trim(), options, hasUserEdit: true });
      onClose();
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  }

  async function acceptCanonical() {
    setSaving(true);
    try {
      await apiFetch(`/api/lectures/${lectureId}/questions/${question.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceptCanonical: true }),
      });
      const c = question.canonical!;
      onSave({ ...question, question: c.question, correctAnswer: c.correctAnswer, explanation: c.explanation, hasUserEdit: false, hasConflict: false, canonical: undefined });
      onClose();
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  }

  async function revertToCanonical() {
    setSaving(true);
    try {
      await apiFetch(`/api/lectures/${lectureId}/questions/${question.id}`, { method: 'DELETE' });
      onSave({ ...question, hasUserEdit: false, hasConflict: false, canonical: undefined });
      onClose();
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  }

  const isCorrect = (opt: string) => opt.trim().toLowerCase() === ca.trim().toLowerCase();
  const questionLabel = TYPE_LABELS[question.type] ?? question.type;

  return (
    <Portal>
      <div className="lm-overlay" onClick={onClose}>
        <div className="lm-modal lm-modal-wide" onClick={e => e.stopPropagation()}>
          <div className="lm-modal-header">
            <div>
              <div className="lm-modal-title">Edit Exam Question</div>
              <div className="lm-modal-sub">Click any section to edit. Your changes are personal.</div>
            </div>
            <button className="lm-modal-close" onClick={onClose}>✕</button>
          </div>
          {question.hasConflict && question.canonical && (
            <div className="lm-conflict-card">
              <div className="lm-conflict-card-title">⚠️ Your instructor updated this question</div>
              <div className="lm-conflict-versions">
                <div className="lm-conflict-col">
                  <div className="lm-conflict-col-label">Instructor's version</div>
                  <div className="lm-conflict-text">{question.canonical.question}</div>
                  <div className="lm-conflict-answer">✓ {question.canonical.correctAnswer}</div>
                </div>
                <div className="lm-conflict-col">
                  <div className="lm-conflict-col-label">Your version</div>
                  <div className="lm-conflict-text">{question.question}</div>
                  <div className="lm-conflict-answer">✓ {question.correctAnswer}</div>
                </div>
              </div>
              <div className="lm-conflict-actions">
                <button className="lm-btn lm-btn-primary" onClick={acceptCanonical} disabled={saving}>✓ Accept instructor's version</button>
                <span className="lm-conflict-or">or keep editing yours below</span>
              </div>
            </div>
          )}
          <div className="lm-qcard">
            <div className="lm-qcard-meta">
              <span className="lm-type-badge">{questionLabel}</span>
              {question.topic && <span className="lm-qcard-topic">{question.topic}</span>}
            </div>
            {/* Question */}
            <div className={`lm-qcard-question ${editingQuestion ? 'lm-qcard-editing' : 'lm-qcard-clickable'}`}
              onClick={() => !editingQuestion && setEditingQuestion(true)}>
              {editingQuestion
                ? <textarea className="lm-qcard-textarea" autoFocus rows={3} value={q}
                    onChange={e => setQ(e.target.value)} onBlur={() => setEditingQuestion(false)} />
                : <><span className="lm-qcard-question-text">{q}</span><span className="lm-qcard-edit-hint">✏️</span></>}
            </div>
            {/* Options (MCQ/TF) */}
            {options.length > 0 && (
              <div className="lm-qcard-options">
                {options.map((opt, i) => {
                  const correct = isCorrect(opt);
                  const isEditing = editingAnswerIdx === i;
                  return (
                    <div key={i}
                      className={`lm-qcard-option ${correct ? 'lm-qcard-option-correct' : ''} ${isEditing ? 'lm-qcard-editing' : 'lm-qcard-clickable'}`}
                      onClick={() => !isEditing && setEditingAnswerIdx(i)}>
                      <span className="lm-qcard-option-letter">{String.fromCharCode(65 + i)}</span>
                      {isEditing
                        ? <input className="lm-qcard-option-input" autoFocus value={opt}
                            onChange={e => setOptions(p => p.map((o, j) => j === i ? e.target.value : o))}
                            onBlur={() => setEditingAnswerIdx(null)} />
                        : <><span className="lm-qcard-option-text">{opt}</span>
                            {correct && <span className="lm-qcard-correct-mark">✓</span>}
                            <span className="lm-qcard-edit-hint">✏️</span></>}
                    </div>
                  );
                })}
              </div>
            )}
            {/* Fill-in correct answer */}
            {options.length === 0 && (
              <div className={`lm-qcard-fillin ${editingCorrect ? 'lm-qcard-editing' : 'lm-qcard-clickable'}`}
                onClick={() => !editingCorrect && setEditingCorrect(true)}>
                <span className="lm-qcard-fillin-label">Correct Answer</span>
                {editingCorrect
                  ? <input className="lm-qcard-option-input" autoFocus value={ca} onChange={e => setCa(e.target.value)} onBlur={() => setEditingCorrect(false)} />
                  : <><span className="lm-qcard-fillin-val">{ca}</span><span className="lm-qcard-edit-hint">✏️</span></>}
              </div>
            )}
            {/* MCQ correct answer text */}
            {options.length > 0 && (
              <div className="lm-qcard-correct-row">
                <span className="lm-qcard-fillin-label">Correct answer text</span>
                <div className={`lm-qcard-fillin lm-qcard-fillin-inline ${editingCorrect ? 'lm-qcard-editing' : 'lm-qcard-clickable'}`}
                  onClick={() => !editingCorrect && setEditingCorrect(true)}>
                  {editingCorrect
                    ? <input className="lm-qcard-option-input" autoFocus value={ca} onChange={e => setCa(e.target.value)} onBlur={() => setEditingCorrect(false)} />
                    : <><span className="lm-qcard-fillin-val">{ca}</span><span className="lm-qcard-edit-hint">✏️</span></>}
                </div>
              </div>
            )}
            {/* Explanation */}
            <div className="lm-qcard-explanation">
              <div className="lm-qcard-exp-label">Explanation</div>
              <div className={`lm-qcard-exp-body ${editingExplanation ? 'lm-qcard-editing' : 'lm-qcard-clickable'}`}
                onClick={() => !editingExplanation && setEditingExplanation(true)}>
                {editingExplanation
                  ? <textarea className="lm-qcard-textarea" autoFocus rows={3} value={exp}
                      onChange={e => setExp(e.target.value)} onBlur={() => setEditingExplanation(false)}
                      placeholder="Add an explanation or memory aid…" />
                  : <><span className="lm-qcard-exp-text">{exp || <span style={{ opacity: .4 }}>No explanation — click to add one</span>}</span>
                      <span className="lm-qcard-edit-hint">✏️</span></>}
              </div>
            </div>
          </div>
          {question.hasUserEdit && !question.hasConflict && (
            <div className="lm-revert-row">
              <span className="lm-edit-badge">✏️ You've edited this question</span>
              <button className="lm-btn lm-btn-ghost lm-btn-sm" onClick={revertToCanonical} disabled={saving}>Revert to original</button>
            </div>
          )}
          {err && <div className="lm-err">{err}</div>}
          <div className="lm-modal-footer">
            <button className="lm-btn lm-btn-ghost" onClick={onClose}>Cancel</button>
            <button className="lm-btn lm-btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save My Edit'}</button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// ─── Add Flashcard Modal ──────────────────────────────────────────────────────

function AddFlashcardModal({ lectureId, onAdded, onClose }: {
  lectureId: string; onAdded: (card: Flashcard) => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [a, setA] = useState('');
  const [topic, setTopic] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!q.trim() || !a.trim()) { setErr('Question and answer are required.'); return; }
    setSaving(true);
    try {
      const data = await apiFetch(`/api/lectures/${lectureId}/flashcards`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q.trim(), answer: a.trim(), topic: topic.trim() || 'General' }),
      });
      onAdded({ id: data.card.id, topic: data.card.topic, slideNumber: null, question: data.card.question, answer: data.card.answer, hasUserEdit: false, hasConflict: false, userEditedAt: null });
      onClose();
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  }

  return (
    <Portal>
      <div className="lm-overlay" onClick={onClose}>
        <div className="lm-modal" onClick={e => e.stopPropagation()}>
          <div className="lm-modal-header">
            <div className="lm-modal-title">Add Flashcard</div>
            <button className="lm-modal-close" onClick={onClose}>✕</button>
          </div>
          <div className="lm-form-field">
            <label className="lm-form-label">Topic <span style={{ opacity: 0.6 }}>(optional)</span></label>
            <input className="lm-input" value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Cardiovascular" />
          </div>
          <div className="lm-form-field">
            <label className="lm-form-label">Question</label>
            <textarea className="lm-textarea" rows={3} value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div className="lm-form-field">
            <label className="lm-form-label">Answer</label>
            <textarea className="lm-textarea" rows={4} value={a} onChange={e => setA(e.target.value)} />
          </div>
          {err && <div className="lm-err">{err}</div>}
          <div className="lm-modal-footer">
            <button className="lm-btn lm-btn-ghost" onClick={onClose}>Cancel</button>
            <button className="lm-btn lm-btn-primary" onClick={save} disabled={saving}>{saving ? 'Adding…' : 'Add Card'}</button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// ─── Add Question Modal ───────────────────────────────────────────────────────

function AddQuestionModal({ lectureId, onAdded, onClose }: {
  lectureId: string; onAdded: (q: ExamQuestion) => void; onClose: () => void;
}) {
  const [question, setQuestion] = useState('');
  const [correct, setCorrect] = useState('');
  const [type, setType] = useState('mcq');
  const [topic, setTopic] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!question.trim() || !correct.trim()) { setErr('Question and correct answer are required.'); return; }
    setSaving(true);
    try {
      const data = await apiFetch(`/api/lectures/${lectureId}/questions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim(), correctAnswer: correct.trim(), type, topic: topic.trim() || 'General' }),
      });
      const qd = data.question;
      onAdded({ id: qd.id, type: qd.type, topic: qd.topic, slideNumber: null, question: qd.question, correctAnswer: qd.correct_answer, options: qd.options ?? [], explanation: qd.explanation ?? '', hasUserEdit: false, hasConflict: false, userEditedAt: null });
      onClose();
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  }

  return (
    <Portal>
      <div className="lm-overlay" onClick={onClose}>
        <div className="lm-modal" onClick={e => e.stopPropagation()}>
          <div className="lm-modal-header">
            <div className="lm-modal-title">Add Exam Question</div>
            <button className="lm-modal-close" onClick={onClose}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="lm-form-field" style={{ flex: 1 }}>
              <label className="lm-form-label">Type</label>
              <select className="lm-select" value={type} onChange={e => setType(e.target.value)}>
                <option value="mcq">Multiple Choice</option>
                <option value="tf">True / False</option>
                <option value="matching">Matching</option>
                <option value="fillin">Fill in the Blank</option>
              </select>
            </div>
            <div className="lm-form-field" style={{ flex: 2 }}>
              <label className="lm-form-label">Topic <span style={{ opacity: 0.6 }}>(optional)</span></label>
              <input className="lm-input" value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Cardiac Auscultation" />
            </div>
          </div>
          <div className="lm-form-field">
            <label className="lm-form-label">Question</label>
            <textarea className="lm-textarea" rows={3} value={question} onChange={e => setQuestion(e.target.value)} />
          </div>
          <div className="lm-form-field">
            <label className="lm-form-label">Correct Answer</label>
            <input className="lm-input" value={correct} onChange={e => setCorrect(e.target.value)} />
          </div>
          {err && <div className="lm-err">{err}</div>}
          <div className="lm-modal-footer">
            <button className="lm-btn lm-btn-ghost" onClick={onClose}>Cancel</button>
            <button className="lm-btn lm-btn-primary" onClick={save} disabled={saving}>{saving ? 'Adding…' : 'Add Question'}</button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// ─── Slides Tab ───────────────────────────────────────────────────────────────

function SlidesTab({ lectureId, onToast }: { lectureId: string; onToast: (m: string, t: 'ok' | 'err') => void }) {
  const [slides, setSlides] = useState<SlideItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [slideError, setSlideError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setSlideError('');
    try {
      const data = await apiFetch(`/api/lectures/${lectureId}/slides`);
      setSlides(data.slides ?? []);
    } catch (e: any) {
      setSlideError(e.message);
    }
    setLoading(false);
  }, [lectureId, onToast]);

  useEffect(() => { load(); }, [load]);

  async function uploadFile(file: File) {
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch(`/api/lectures/${lectureId}/slides`, { method: 'POST', body: form });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Upload failed');
      }
      onToast('Slide uploaded.', 'ok');
      load();
    } catch (e: any) { onToast(e.message, 'err'); }
    setUploading(false);
  }

  async function deleteSlide(slideNum: number | null, name: string) {
    if (slideNum == null) return;
    setDeleting(name);
    try {
      await apiFetch(`/api/lectures/${lectureId}/slides/${slideNum}`, { method: 'DELETE' });
      onToast('Slide deleted.', 'ok');
      setSlides(s => s.filter(sl => sl.name !== name));
    } catch (e: any) { onToast(e.message, 'err'); }
    setDeleting(null);
  }

  return (
    <div>
      <div className="lm-slides-header">
        <span className="lm-slides-count">{slides.length} slide{slides.length !== 1 ? 's' : ''}</span>
        <button className="lm-btn lm-btn-primary lm-btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading…' : '+ Upload Slide'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ''; }} />
      </div>
      {loading ? (
        <div className="lm-loading">Loading slides…</div>
      ) : slideError ? (
        <div className="lm-slide-error">
          <div>⚠️ Could not load slides</div>
          <div className="lm-muted" style={{ fontSize: 12, marginTop: 4 }}>{slideError}</div>
          <button className="lm-btn lm-btn-ghost lm-btn-sm" style={{ marginTop: 10 }} onClick={load}>Retry</button>
        </div>
      ) : slides.length === 0 ? (
        <div className="lm-empty-slides">
          <div style={{ fontSize: 32, marginBottom: 8 }}>🖼️</div>
          <div>No slides uploaded yet.</div>
          <div className="lm-muted" style={{ marginTop: 4 }}>Slides here appear in the study lightbox.</div>
        </div>
      ) : (
        <div className="lm-slides-grid">
          {slides.map(sl => (
            <div key={sl.name} className="lm-slide-card">
              {sl.url
                ? <img src={sl.url} alt={sl.name} className="lm-slide-img" loading="lazy"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                : <div className="lm-slide-placeholder">🖼️</div>}
              <div className="lm-slide-meta">
                <span className="lm-slide-num">{sl.slideNumber != null ? `Slide ${sl.slideNumber}` : sl.name}</span>
                <span className="lm-slide-size">{fmtSize(sl.size)}</span>
              </div>
              <button className="lm-slide-delete" onClick={() => deleteSlide(sl.slideNumber, sl.name)}
                disabled={deleting === sl.name} aria-label="Delete slide">
                {deleting === sl.name ? '…' : '✕'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Expanded Row ─────────────────────────────────────────────────────────────
// NOTE: No modal state here — all modal state is lifted to LecturesClient.

function ExpandedRow({ summary, onToast, onSummaryChange, onOpenModal, detailCache, onDetailLoad }: {
  summary: LectureSummary;
  onToast: (m: string, t: 'ok' | 'err') => void;
  onSummaryChange: (updated: Partial<LectureSummary>) => void;
  onOpenModal: (state: ModalState) => void;
  detailCache: LectureDetail | null;
  onDetailLoad: (d: LectureDetail) => void;
}) {
  const [tab, setTab] = useState<TabId>('info');
  const [loading, setLoading] = useState(!detailCache);
  const detail = detailCache;

  const [customTitle, setCustomTitle] = useState(summary.customTitle ?? '');
  const [groupId, setGroupId]         = useState(summary.groupId ?? '');
  const [tagInput, setTagInput]       = useState('');
  const [tags, setTags]               = useState<string[]>(summary.tags);
  const [course, setCourse]           = useState(summary.course);
  const [color, setColor]             = useState(summary.color);
  const [icon, setIcon]               = useState(summary.icon);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [savingMeta, setSavingMeta]   = useState(false);
  const iconBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (detailCache) { setLoading(false); return; }
    setLoading(true);
    apiFetch(`/api/lectures/${summary.id}`)
      .then(data => { onDetailLoad(data); setLoading(false); })
      .catch(e => { onToast(e.message, 'err'); setLoading(false); });
  }, [summary.id, detailCache, onDetailLoad, onToast]);

  async function saveMeta() {
    setSavingMeta(true);
    try {
      await apiFetch(`/api/lectures/${summary.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customTitle: customTitle.trim() || null, groupId: groupId.trim() || null, tags }),
      });
      await apiFetch('/api/lectures/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          internalId: summary.id,
          updates: {
            courseOverride: course !== summary.course ? course : null,
            colorOverride: color !== summary.color ? color : null,
          },
        }),
      });
      onToast('Saved.', 'ok');
      onSummaryChange({ customTitle: customTitle.trim() || null, course, color, icon, tags, groupId: groupId.trim() || null });
    } catch (e: any) { onToast(e.message, 'err'); }
    setSavingMeta(false);
  }

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags(p => [...p, t]);
    setTagInput('');
  }

  const TABS: { id: TabId; label: string }[] = [
    { id: 'info',       label: 'General Info' },
    { id: 'flashcards', label: `Flashcards${detail ? ` (${detail.flashcards.length})` : ''}` },
    { id: 'questions',  label: `Exam Questions${detail ? ` (${detail.questions.length})` : ''}` },
    { id: 'slides',     label: `Slides${summary.slideCount > 0 ? ` (${summary.slideCount})` : ''}` },
  ];

  return (
    <tr>
      <td colSpan={9} className="lm-expand-cell">
        <div className="lm-expand-panel">
          <div className="lm-tabs">
            {TABS.map(t => (
              <button key={t.id} className={`lm-tab ${tab === t.id ? 'lm-tab-active' : ''}`} onClick={() => setTab(t.id)}>
                {t.label}
                {(t.id === 'flashcards' || t.id === 'questions') && detail?.conflictCount && tab !== t.id
                  ? <span className="lm-tab-conflict">!</span> : null}
              </button>
            ))}
          </div>

          {loading ? <div className="lm-loading">Loading…</div> : (
            <>
              {detail && <ConflictBanner count={detail.conflictCount} />}

              {/* ── General Info ── */}
              {tab === 'info' && (
                <div className="lm-meta-grid">
                  {/* Icon: compact, auto-width column */}
                  <div className="lm-form-field lm-form-field-icon">
                    <label className="lm-form-label">Icon</label>
                    <button ref={iconBtnRef} className="lm-icon-btn" type="button"
                      onClick={() => setShowIconPicker(v => !v)} title="Change icon">
                      {icon}
                    </button>
                    {showIconPicker && (
                      <IconPicker current={icon} anchorRef={iconBtnRef} onSelect={setIcon} onClose={() => setShowIconPicker(false)} />
                    )}
                  </div>

                  {/* Display Title */}
                  <div className="lm-form-field">
                    <label className="lm-form-label">Display Title</label>
                    <input className="lm-input" value={customTitle} onChange={e => setCustomTitle(e.target.value)} placeholder={summary.title} />
                    <div className="lm-field-hint">Rename this lecture for yourself only.</div>
                  </div>

                  {/* empty cell — icon col is 1, title col is 2; row ends at col 2 */}
                  {/* Course + Color span row 2, cols 1+2 via lm-form-field-full isn't right — use explicit col-span */}

                  {/* Course */}
                  <div className="lm-form-field">
                    <label className="lm-form-label">Course</label>
                    <select className="lm-select" value={course} onChange={e => setCourse(e.target.value)}>
                      {COURSES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <div className="lm-field-hint">Override which course this appears under.</div>
                  </div>

                  {/* Accent Color */}
                  <div className="lm-form-field">
                    <label className="lm-form-label">Accent Color</label>
                    <div className="lm-color-row">
                      {PRESET_COLORS.map(hex => (
                        <button key={hex} className={`lm-color-swatch ${color === hex ? 'lm-color-swatch-selected' : ''}`}
                          style={{ background: hex }} onClick={() => setColor(hex)} aria-label={hex} />
                      ))}
                      <input type="color" value={color} onChange={e => setColor(e.target.value)} className="lm-color-custom" title="Custom color" />
                    </div>
                  </div>

                  {/* Study Block */}
                  <div className="lm-form-field">
                    <label className="lm-form-label">Study Block</label>
                    <input className="lm-input" value={groupId} onChange={e => setGroupId(e.target.value)} placeholder="e.g. Fall 2026 Block 1" />
                    <div className="lm-field-hint">Group with others for focused study.</div>
                  </div>

                  <div />{/* spacer to fill second column */}

                  {/* Tags */}
                  <div className="lm-form-field lm-form-field-full">
                    <label className="lm-form-label">Tags</label>
                    <div className="lm-tag-editor">
                      {tags.map(tag => (
                        <span key={tag} className="lm-tag">{tag}
                          <button className="lm-tag-remove" onClick={() => setTags(t => t.filter(x => x !== tag))}>✕</button>
                        </span>
                      ))}
                      <input className="lm-tag-input" value={tagInput} onChange={e => setTagInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
                        placeholder="Type a tag and press Enter…" />
                    </div>
                  </div>

                  {/* Stats strip */}
                  <div className="lm-form-field lm-form-field-full">
                    <div className="lm-readonly-info">
                      <div><span className="lm-readonly-label">Slides</span><span className="lm-readonly-val">{summary.slideCount}</span></div>
                      <div><span className="lm-readonly-label">Flashcards</span><span className="lm-readonly-val">{summary.flashcardCount}</span></div>
                      <div><span className="lm-readonly-label">Questions</span><span className="lm-readonly-val">{summary.questionCount}</span></div>
                      <div><span className="lm-readonly-label">Added</span><span className="lm-readonly-val">{fmt(summary.createdAt)}</span></div>
                    </div>
                  </div>

                  <div className="lm-form-field lm-form-field-full">
                    <button className="lm-btn lm-btn-primary" style={{ alignSelf: 'flex-start' }} onClick={saveMeta} disabled={savingMeta}>
                      {savingMeta ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Flashcards ── */}
              {tab === 'flashcards' && detail && (
                <div>
                  {detail.flashcards.length === 0 ? <div className="lm-empty">No flashcards yet.</div> : (
                    <div className="lm-card-table-wrap">
                      <table className="lm-card-table">
                        <thead><tr><th>Topic</th><th>Question</th><th>Answer</th><th>Slide</th><th></th></tr></thead>
                        <tbody>
                          {detail.flashcards.map(card => (
                            <tr key={card.id}
                              className={`lm-card-row ${card.hasConflict ? 'lm-card-conflict' : card.hasUserEdit ? 'lm-card-edited' : ''}`}
                              onClick={() => onOpenModal({ kind: 'edit-fc', lectureId: summary.id, card })}>
                              <td className="lm-card-topic">{card.topic}</td>
                              <td className="lm-card-preview">{card.question}</td>
                              <td className="lm-card-preview lm-card-answer">{card.answer}</td>
                              <td className="lm-card-slide">{card.slideNumber ?? '—'}</td>
                              <td className="lm-card-actions">
                                {card.hasConflict && <span className="lm-badge lm-badge-conflict">⚠️ Updated</span>}
                                {card.hasUserEdit && !card.hasConflict && <span className="lm-badge lm-badge-edit">✏️</span>}
                                <span className="lm-edit-hint">Edit →</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="lm-add-row">
                    <button className="lm-btn lm-btn-ghost lm-btn-sm" onClick={() => onOpenModal({ kind: 'add-fc', lectureId: summary.id })}>
                      + Add Flashcard
                    </button>
                  </div>
                </div>
              )}

              {/* ── Exam Questions ── */}
              {tab === 'questions' && detail && (
                <div>
                  {detail.questions.length === 0 ? <div className="lm-empty">No exam questions yet.</div> : (
                    <div className="lm-card-table-wrap">
                      <table className="lm-card-table">
                        <thead><tr><th>Type</th><th>Topic</th><th>Question</th><th>Correct Answer</th><th></th></tr></thead>
                        <tbody>
                          {detail.questions.map(q => (
                            <tr key={q.id}
                              className={`lm-card-row ${q.hasConflict ? 'lm-card-conflict' : q.hasUserEdit ? 'lm-card-edited' : ''}`}
                              onClick={() => onOpenModal({ kind: 'edit-q', lectureId: summary.id, question: q })}>
                              <td><span className="lm-type-badge">{TYPE_LABELS[q.type] ?? q.type}</span></td>
                              <td className="lm-card-topic">{q.topic}</td>
                              <td className="lm-card-preview">{q.question}</td>
                              <td className="lm-card-preview lm-card-answer">{q.correctAnswer}</td>
                              <td className="lm-card-actions">
                                {q.hasConflict && <span className="lm-badge lm-badge-conflict">⚠️ Updated</span>}
                                {q.hasUserEdit && !q.hasConflict && <span className="lm-badge lm-badge-edit">✏️</span>}
                                <span className="lm-edit-hint">Edit →</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="lm-add-row">
                    <button className="lm-btn lm-btn-ghost lm-btn-sm" onClick={() => onOpenModal({ kind: 'add-q', lectureId: summary.id })}>
                      + Add Exam Question
                    </button>
                  </div>
                </div>
              )}

              {/* ── Slides ── */}
              {tab === 'slides' && <SlidesTab lectureId={summary.id} onToast={onToast} />}
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Sortable Row ─────────────────────────────────────────────────────────────

function SortableRow({ lecture, expanded, onToggle, onToast, onSummaryChange, onOpenModal, detailCache, onDetailLoad }: {
  lecture: LectureSummary;
  expanded: boolean;
  onToggle: () => void;
  onToast: (m: string, t: 'ok' | 'err') => void;
  onSummaryChange: (u: Partial<LectureSummary>) => void;
  onOpenModal: (state: ModalState) => void;
  detailCache: LectureDetail | null;
  onDetailLoad: (d: LectureDetail) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lecture.id });
  const style: React.CSSProperties = {
    transform: dndCSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: isDragging ? 'relative' : undefined,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <React.Fragment>
      <tr ref={setNodeRef} style={style} className={`lm-row ${expanded ? 'lm-row-open' : ''}`} onClick={onToggle}>
        <td className="lm-drag-cell" onClick={e => e.stopPropagation()}>
          <span className="lm-drag-handle" {...attributes} {...listeners} title="Drag to reorder">⠿</span>
        </td>
        <td className="lm-row-icon">{lecture.icon}</td>
        <td className="lm-row-title-cell">
          <div className="lm-row-title">{lecture.customTitle ?? lecture.title}</div>
          {lecture.subtitle && <div className="lm-row-subtitle">{lecture.subtitle}</div>}
          {lecture.tags.length > 0 && (
            <div className="lm-row-tags">
              {lecture.tags.slice(0, 3).map(t => <span key={t} className="lm-row-tag">{t}</span>)}
              {lecture.tags.length > 3 && <span className="lm-row-tag lm-row-tag-more">+{lecture.tags.length - 3}</span>}
            </div>
          )}
        </td>
        <td>
          <span className="lm-course-pill"
            style={{ background: `${COURSE_COLORS[lecture.course] ?? '#5b8dee'}18`, color: COURSE_COLORS[lecture.course] ?? '#5b8dee' }}>
            {lecture.course}
          </span>
        </td>
        <td className="lm-num-cell">{lecture.slideCount}</td>
        <td className="lm-num-cell" style={{ color: 'var(--accent)' }}>{lecture.flashcardCount}</td>
        <td className="lm-num-cell" style={{ color: '#8b5cf6' }}>{lecture.questionCount}</td>
        <td className="lm-muted lm-date-cell">{fmt(lecture.createdAt)}</td>
        <td className="lm-chevron-cell"><span className="lm-chevron">{expanded ? '▲' : '▼'}</span></td>
      </tr>
      {expanded && (
        <ExpandedRow
          summary={lecture}
          onToast={onToast}
          onSummaryChange={onSummaryChange}
          onOpenModal={onOpenModal}
          detailCache={detailCache}
          onDetailLoad={onDetailLoad}
        />
      )}
    </React.Fragment>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function PageFooter() {
  return (
    <footer className="lm-footer">
      <div className="lm-footer-inner">
        <div className="lm-footer-logo">Study<span className="lm-footer-md">MD</span></div>
        <div className="lm-footer-tagline">Designed for Haley Lange</div>
        <div className="lm-footer-links">
          <Link href="/app" className="lm-footer-link">Dashboard</Link>
          <Link href="/app/upload" className="lm-footer-link">Upload</Link>
          <Link href="/app/profile" className="lm-footer-link">Profile</Link>
        </div>
      </div>
    </footer>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LecturesClient({ initialLectures }: { initialLectures: LectureSummary[] }) {
  const [lectures, setLectures] = useState<LectureSummary[]>(initialLectures);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [savingOrder, setSavingOrder] = useState(false);

  // Modal state lives HERE — outside the table entirely
  const [modal, setModal] = useState<ModalState>(null);

  // Detail cache per lecture — avoids re-fetching on re-expand
  const [detailCache, setDetailCache] = useState<Record<string, LectureDetail>>({});

  // Header auth state
  const [userId, setUserId] = useState('');
  const [theme, setTheme] = useState<Theme>('midnight');

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
    try {
      const stored = localStorage.getItem('studymd_theme') as Theme | null;
      if (stored === 'midnight' || stored === 'pink' || stored === 'forest') setTheme(stored);
    } catch {}
  }, []);

  const showToast = useCallback((msg: string, type: 'ok' | 'err') => setToast({ msg, type }), []);

  function updateSummary(id: string, updates: Partial<LectureSummary>) {
    setLectures(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
  }

  function updateDetailCache(lectureId: string, updater: (d: LectureDetail) => LectureDetail) {
    setDetailCache(prev => {
      const existing = prev[lectureId];
      if (!existing) return prev;
      return { ...prev, [lectureId]: updater(existing) };
    });
  }

  const courses = [...new Set(initialLectures.map(l => l.course))].sort();
  const filtered = lectures.filter(l => {
    const matchesCourse = courseFilter === 'all' || l.course === courseFilter;
    const matchesSearch = !search ||
      (l.customTitle ?? l.title).toLowerCase().includes(search.toLowerCase()) ||
      l.course.toLowerCase().includes(search.toLowerCase());
    return matchesCourse && matchesSearch;
  });

  // ── Drag reorder ──────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = lectures.findIndex(l => l.id === active.id);
    const newIndex = lectures.findIndex(l => l.id === over.id);
    const reordered = arrayMove(lectures, oldIndex, newIndex);
    setLectures(reordered);
    setSavingOrder(true);
    try {
      const order = reordered.map((l, i) => ({ internalId: l.id, displayOrder: i }));
      await apiFetch('/api/lectures/reorder', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      });
    } catch (e: any) {
      showToast('Could not save order: ' + e.message, 'err');
      setLectures(lectures);
    }
    setSavingOrder(false);
  }

  // ── Modal handlers ────────────────────────────────────────────────────────

  function handleModalSaveFlashcard(lectureId: string, updated: Flashcard) {
    updateDetailCache(lectureId, d => ({
      ...d, flashcards: d.flashcards.map(f => f.id === updated.id ? updated : f),
    }));
    setModal(null);
  }

  function handleModalAddFlashcard(lectureId: string, card: Flashcard) {
    updateDetailCache(lectureId, d => ({ ...d, flashcards: [...d.flashcards, card] }));
    showToast('Flashcard added.', 'ok');
    setModal(null);
  }

  function handleModalSaveQuestion(lectureId: string, updated: ExamQuestion) {
    updateDetailCache(lectureId, d => ({
      ...d, questions: d.questions.map(q => q.id === updated.id ? updated : q),
    }));
    setModal(null);
  }

  function handleModalAddQuestion(lectureId: string, q: ExamQuestion) {
    updateDetailCache(lectureId, d => ({ ...d, questions: [...d.questions, q] }));
    showToast('Question added.', 'ok');
    setModal(null);
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="lm-root">

        {/* Real StudyMD header with gear/settings */}
        <Header
          lectureCount={lectures.length}
          userId={userId}
          initialTheme={theme}
          hideUploadButton={false}
        />

        <div className="lm-page-wrap">
          {/* Title bar */}
          <div className="lm-title-bar">
            <Link href="/app" className="lm-back">← Dashboard</Link>
            <div className="lm-title-bar-bottom">
              <div className="lm-title-row">
                <h1 className="lm-title">My Lectures</h1>
                <span className="lm-count">{lectures.length}</span>
                {savingOrder && <span className="lm-saving-order">Saving order…</span>}
              </div>
              <div className="lm-header-controls">
                <input className="lm-search" placeholder="Search lectures…" value={search} onChange={e => setSearch(e.target.value)} />
                <select className="lm-filter-select" value={courseFilter} onChange={e => setCourseFilter(e.target.value)}>
                  <option value="all">All Courses</option>
                  {courses.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Table header row */}
          <div className="lm-table-header-row">
            <span className="lm-table-hint">⠿ Drag rows to reorder</span>
            <Link href="/app/upload" className="lm-btn lm-btn-primary lm-btn-sm">↑ Upload Lecture</Link>
          </div>

          <div className="lm-table-outer">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={filtered.map(l => l.id)} strategy={verticalListSortingStrategy}>
                <table className="lm-table">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}></th>
                      <th style={{ width: 40 }}></th>
                      <th>Lecture</th>
                      <th>Course</th>
                      <th style={{ width: 72, textAlign: 'center' }}>Slides</th>
                      <th style={{ width: 72, textAlign: 'center' }}>Cards</th>
                      <th style={{ width: 84, textAlign: 'center' }}>Questions</th>
                      <th style={{ width: 120 }}>Added</th>
                      <th style={{ width: 40 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr><td colSpan={9} className="lm-empty-row">No lectures match your filters.</td></tr>
                    )}
                    {filtered.map(l => (
                      <SortableRow
                        key={l.id}
                        lecture={l}
                        expanded={expanded === l.id}
                        onToggle={() => setExpanded(expanded === l.id ? null : l.id)}
                        onToast={showToast}
                        onSummaryChange={u => updateSummary(l.id, u)}
                        onOpenModal={setModal}
                        detailCache={detailCache[l.id] ?? null}
                        onDetailLoad={d => setDetailCache(p => ({ ...p, [l.id]: d }))}
                      />
                    ))}
                  </tbody>
                </table>
              </SortableContext>
            </DndContext>
          </div>
        </div>

        <PageFooter />

        {/* ── All modals rendered here — outside <table> entirely ── */}
        {modal?.kind === 'edit-fc' && (
          <FlashcardEditModal
            card={modal.card}
            lectureId={modal.lectureId}
            onSave={u => handleModalSaveFlashcard(modal.lectureId, u)}
            onClose={() => setModal(null)}
          />
        )}
        {modal?.kind === 'edit-q' && (
          <QuestionEditModal
            question={modal.question}
            lectureId={modal.lectureId}
            onSave={u => handleModalSaveQuestion(modal.lectureId, u)}
            onClose={() => setModal(null)}
          />
        )}
        {modal?.kind === 'add-fc' && (
          <AddFlashcardModal
            lectureId={modal.lectureId}
            onAdded={c => handleModalAddFlashcard(modal.lectureId, c)}
            onClose={() => setModal(null)}
          />
        )}
        {modal?.kind === 'add-q' && (
          <AddQuestionModal
            lectureId={modal.lectureId}
            onAdded={q => handleModalAddQuestion(modal.lectureId, q)}
            onClose={() => setModal(null)}
          />
        )}

        {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      </div>
    </>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
.lm-root { min-height: 100vh; background: var(--bg, #0d0f14); color: var(--text, #e8eaf0); font-family: 'Outfit', sans-serif; display: flex; flex-direction: column; }

/* ── Page padding ── */
.lm-page-wrap { padding: 0 40px; flex: 1; }

/* ── Title bar ── */
.lm-title-bar { padding: 20px 0 14px; border-bottom: 1px solid var(--border, rgba(255,255,255,0.08)); margin-bottom: 0; }
.lm-title-bar-bottom { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-top: 8px; }
.lm-title-row { display: flex; align-items: center; gap: 10px; }
.lm-back { font-size: 13px; color: var(--text-muted, #6b7280); text-decoration: none; transition: color .15s; }
.lm-back:hover { color: var(--accent, #5b8dee); }
.lm-title { font-family: 'Fraunces', serif; font-size: 26px; font-weight: 700; margin: 0; }
.lm-count { font-size: 12px; color: var(--text-muted); background: rgba(255,255,255,.07); border-radius: 100px; padding: 2px 10px; font-family: 'DM Mono', monospace; }
.lm-saving-order { font-size: 11px; color: var(--text-muted); font-style: italic; }
.lm-header-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.lm-search { background: var(--surface, #13161d); border: 1px solid var(--border); border-radius: 10px; color: var(--text); font-family: 'Outfit', sans-serif; font-size: 13px; padding: 9px 14px; outline: none; min-width: 200px; min-height: 40px; }
.lm-search:focus { border-color: var(--accent); }
.lm-filter-select { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; color: var(--text); font-family: 'Outfit', sans-serif; font-size: 13px; padding: 9px 12px; outline: none; min-height: 40px; cursor: pointer; }
.lm-filter-select:focus { border-color: var(--accent); }

/* ── Table header row ── */
.lm-table-header-row { display: flex; align-items: center; justify-content: space-between; padding: 14px 0 8px; }
.lm-table-hint { font-size: 12px; color: var(--text-muted); }

/* ── Table ── */
.lm-table-outer { border: 1px solid var(--border, rgba(255,255,255,0.08)); border-radius: 16px; overflow: hidden; margin-bottom: 32px; overflow-x: auto; }
.lm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.lm-table th { padding: 10px 12px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted); border-bottom: 1px solid var(--border); background: rgba(255,255,255,.02); white-space: nowrap; }
.lm-table td { padding: 12px 12px; border-bottom: 1px solid rgba(255,255,255,.04); vertical-align: middle; }
.lm-row { cursor: pointer; transition: background .12s; }
.lm-row:hover { background: rgba(255,255,255,.025); }
.lm-row-open { background: rgba(91,141,238,.05) !important; border-bottom: none; }
.lm-drag-cell { width: 36px; text-align: center; padding: 0 4px !important; }
.lm-drag-handle { font-size: 16px; color: var(--text-muted); cursor: grab; user-select: none; display: inline-block; padding: 8px 4px; line-height: 1; opacity: .4; transition: opacity .13s; }
.lm-drag-handle:hover { opacity: 1; color: var(--accent); }
.lm-drag-handle:active { cursor: grabbing; }
.lm-row-icon { font-size: 20px; text-align: center; }
.lm-row-title-cell { min-width: 180px; }
.lm-row-title { font-weight: 600; color: var(--text); line-height: 1.3; }
.lm-row-subtitle { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.lm-row-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
.lm-row-tag { font-size: 10px; padding: 1px 7px; border-radius: 100px; background: rgba(91,141,238,.1); color: var(--accent, #5b8dee); font-weight: 600; }
.lm-row-tag-more { background: rgba(255,255,255,.06); color: var(--text-muted); }
.lm-course-pill { display: inline-flex; padding: 3px 10px; border-radius: 100px; font-size: 11px; font-weight: 600; white-space: nowrap; }
.lm-num-cell { text-align: center; font-family: 'DM Mono', monospace; font-size: 13px; }
.lm-date-cell { white-space: nowrap; }
.lm-muted { color: var(--text-muted); font-size: 12px; }
.lm-chevron-cell { text-align: center; }
.lm-chevron { font-size: 10px; color: var(--text-muted); }
.lm-empty-row { text-align: center; color: var(--text-muted); padding: 48px; font-size: 14px; }

/* ── Expanded Panel ── */
.lm-expand-cell { padding: 0 !important; background: var(--surface, #13161d); border-bottom: 2px solid rgba(91,141,238,.25) !important; }
.lm-expand-panel { padding: 24px 32px 28px; }

/* ── Tabs ── */
.lm-tabs { display: flex; gap: 2px; margin-bottom: 20px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
.lm-tab { background: none; border: none; padding: 9px 18px; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500; color: var(--text-muted); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color .13s, border-color .13s; min-height: 44px; border-radius: 8px 8px 0 0; position: relative; }
.lm-tab:hover { color: var(--text); }
.lm-tab-active { color: var(--accent, #5b8dee) !important; border-bottom-color: var(--accent) !important; font-weight: 600; }
.lm-tab-conflict { position: absolute; top: 6px; right: 6px; background: #ef4444; color: #fff; font-size: 9px; font-weight: 700; border-radius: 50%; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; }

/* ── Conflict Banner ── */
.lm-conflict-banner { display: flex; gap: 10px; align-items: flex-start; background: rgba(239,68,68,.08); border: 1px solid rgba(239,68,68,.25); border-radius: 12px; padding: 12px 16px; margin-bottom: 18px; font-size: 13px; line-height: 1.6; color: var(--text); }

/* ── General Info grid — 2 col ── */
.lm-meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px 24px; align-items: start; }
.lm-form-field { display: flex; flex-direction: column; gap: 6px; }
.lm-form-field-full { grid-column: 1 / -1; }
/* Icon field sits in its own cell but doesn't stretch — use align-self */
.lm-form-field-icon { align-self: start; width: fit-content; }
.lm-form-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted); font-family: 'DM Mono', monospace; }
.lm-field-hint { font-size: 11px; color: var(--text-muted); opacity: .7; }
.lm-input { background: var(--bg, #0d0f14); border: 1px solid var(--border); border-radius: 10px; color: var(--text); font-family: 'Outfit', sans-serif; font-size: 13px; padding: 10px 14px; outline: none; min-height: 44px; width: 100%; }
.lm-input:focus { border-color: var(--accent); }
.lm-select { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; color: var(--text); font-family: 'Outfit', sans-serif; font-size: 13px; padding: 10px 14px; outline: none; min-height: 44px; width: 100%; cursor: pointer; }
.lm-select:focus { border-color: var(--accent); }

/* ── Icon button — compact square ── */
.lm-icon-btn { width: 52px; height: 52px; background: var(--bg, #0d0f14); border: 1px solid var(--border); border-radius: 12px; font-size: 26px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: border-color .15s, background .15s; }
.lm-icon-btn:hover { border-color: var(--accent, #5b8dee); background: rgba(91,141,238,.06); }

/* ── Icon picker (portal, fixed, viewport-clamped) ── */
.lm-icon-picker-backdrop { position: fixed; inset: 0; z-index: 1998; background: transparent; }
.lm-icon-picker { position: fixed; background: var(--surface, #13161d); border: 1px solid rgba(255,255,255,.14); border-radius: 14px; padding: 14px; box-shadow: 0 16px 48px rgba(0,0,0,.75); z-index: 1999; width: 252px; }
.lm-icon-picker-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: var(--text-muted); margin-bottom: 8px; font-family: 'DM Mono', monospace; }
.lm-icon-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; }
.lm-icon-opt { background: none; border: 1px solid transparent; border-radius: 8px; font-size: 20px; cursor: pointer; padding: 5px; aspect-ratio: 1; display: flex; align-items: center; justify-content: center; transition: background .1s, border-color .1s; }
.lm-icon-opt:hover { background: rgba(255,255,255,.09); }
.lm-icon-opt-selected { background: rgba(91,141,238,.18); border-color: var(--accent); }

/* ── Color row ── */
.lm-color-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.lm-color-swatch { width: 26px; height: 26px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; transition: transform .13s, border-color .13s; flex-shrink: 0; }
.lm-color-swatch:hover { transform: scale(1.15); }
.lm-color-swatch-selected { border-color: #fff; transform: scale(1.2); box-shadow: 0 0 0 2px rgba(255,255,255,.3); }
.lm-color-custom { width: 26px; height: 26px; border-radius: 50%; border: 2px solid rgba(255,255,255,.15); cursor: pointer; padding: 0; background: none; }

/* ── Tag editor ── */
.lm-tag-editor { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px; min-height: 44px; }
.lm-tag { display: inline-flex; align-items: center; gap: 5px; background: rgba(91,141,238,.12); color: var(--accent); border-radius: 100px; padding: 3px 10px; font-size: 12px; font-weight: 600; }
.lm-tag-remove { background: none; border: none; color: inherit; cursor: pointer; font-size: 10px; padding: 0; opacity: .7; }
.lm-tag-remove:hover { opacity: 1; }
.lm-tag-input { background: none; border: none; outline: none; color: var(--text); font-family: 'Outfit', sans-serif; font-size: 13px; min-width: 100px; flex: 1; }

/* ── Readonly info strip ── */
.lm-readonly-info { display: flex; gap: 24px; flex-wrap: wrap; background: rgba(255,255,255,.02); border: 1px solid var(--border); border-radius: 10px; padding: 12px 16px; }
.lm-readonly-label { font-size: 11px; color: var(--text-muted); margin-right: 6px; text-transform: uppercase; letter-spacing: .06em; font-family: 'DM Mono', monospace; }
.lm-readonly-val { font-size: 13px; color: var(--text); font-weight: 500; }

/* ── Card tables ── */
.lm-card-table-wrap { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; max-height: 420px; overflow-y: auto; overflow-x: auto; }
.lm-card-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.lm-card-table th { padding: 9px 14px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted); border-bottom: 1px solid var(--border); background: rgba(255,255,255,.02); position: sticky; top: 0; z-index: 2; white-space: nowrap; }
.lm-card-table td { padding: 11px 14px; border-bottom: 1px solid rgba(255,255,255,.04); vertical-align: top; }
.lm-card-row { cursor: pointer; transition: background .1s; }
.lm-card-row:hover { background: rgba(255,255,255,.03); }
.lm-card-row:last-child td { border-bottom: none; }
.lm-card-edited { background: rgba(91,141,238,.04); }
.lm-card-conflict { background: rgba(239,68,68,.05); }
.lm-card-topic { color: var(--text-muted); font-size: 11px; white-space: nowrap; max-width: 110px; overflow: hidden; text-overflow: ellipsis; }
.lm-card-preview { max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); line-height: 1.4; }
.lm-card-answer { color: var(--accent, #5b8dee); }
.lm-card-slide { color: var(--text-muted); font-family: 'DM Mono', monospace; font-size: 11px; text-align: center; }
.lm-card-actions { white-space: nowrap; }
.lm-badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 100px; font-size: 10px; font-weight: 700; }
.lm-badge-conflict { background: rgba(239,68,68,.15); color: #ef4444; }
.lm-badge-edit { background: rgba(91,141,238,.12); color: var(--accent); }
.lm-edit-hint { font-size: 11px; color: var(--text-muted); margin-left: 6px; }
.lm-type-badge { display: inline-flex; padding: 2px 8px; border-radius: 100px; font-size: 10px; font-weight: 700; background: rgba(139,92,246,.12); color: #8b5cf6; white-space: nowrap; }
.lm-add-row { padding: 12px 0 4px; display: flex; justify-content: flex-end; }

/* ── Slides tab ── */
.lm-slides-header { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
.lm-slides-count { font-size: 13px; color: var(--text-muted); flex: 1; }
.lm-slides-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 14px; }
.lm-slide-card { position: relative; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.lm-slide-img { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; }
.lm-slide-placeholder { width: 100%; aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center; font-size: 28px; background: rgba(255,255,255,.03); }
.lm-slide-meta { display: flex; justify-content: space-between; align-items: center; padding: 7px 10px; }
.lm-slide-num { font-size: 11px; font-weight: 600; color: var(--text); }
.lm-slide-size { font-size: 10px; color: var(--text-muted); }
.lm-slide-delete { position: absolute; top: 6px; right: 6px; background: rgba(0,0,0,.6); border: none; border-radius: 50%; width: 22px; height: 22px; color: #fff; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity .15s; }
.lm-slide-card:hover .lm-slide-delete { opacity: 1; }
.lm-slide-delete:hover { background: #ef4444; }
.lm-empty-slides { text-align: center; padding: 40px 20px; color: var(--text-muted); font-size: 14px; line-height: 2; }
.lm-slide-error { text-align: center; padding: 32px; color: var(--text-muted); font-size: 14px; }

/* ── Modals ── */
.lm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.65); backdrop-filter: blur(4px); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; }
.lm-modal { background: var(--surface, #13161d); border: 1px solid rgba(255,255,255,.12); border-radius: 20px; padding: 28px 32px; max-width: 560px; width: 100%; box-shadow: 0 24px 64px rgba(0,0,0,.6); animation: lm-modal-in .18s ease; max-height: 90vh; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }
.lm-modal-wide { max-width: 680px; }
@keyframes lm-modal-in { from { opacity: 0; transform: scale(.95); } to { opacity: 1; transform: scale(1); } }
.lm-modal-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.lm-modal-title { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 700; }
.lm-modal-sub { font-size: 12px; color: var(--text-muted); margin-top: 3px; }
.lm-modal-close { background: none; border: none; color: var(--text-muted); font-size: 16px; cursor: pointer; padding: 4px; flex-shrink: 0; }
.lm-modal-close:hover { color: var(--text); }
.lm-textarea { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; color: var(--text); font-family: 'Outfit', sans-serif; font-size: 13px; padding: 10px 14px; outline: none; width: 100%; resize: vertical; line-height: 1.6; }
.lm-textarea:focus { border-color: var(--accent); }
.lm-modal-footer { display: flex; gap: 10px; justify-content: flex-end; margin-top: 4px; }

/* ── Question card ── */
.lm-qcard { background: var(--bg, #0d0f14); border: 1px solid var(--border); border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.lm-qcard-meta { display: flex; align-items: center; gap: 10px; }
.lm-qcard-topic { font-size: 12px; color: var(--text-muted); }
.lm-qcard-question { border-radius: 10px; padding: 14px; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.lm-qcard-question-text { font-size: 15px; font-weight: 600; color: var(--text); line-height: 1.5; flex: 1; }
.lm-qcard-clickable { cursor: pointer; background: rgba(255,255,255,.03); border: 1px dashed rgba(255,255,255,.1); transition: border-color .13s, background .13s; }
.lm-qcard-clickable:hover { border-color: var(--accent, #5b8dee); background: rgba(91,141,238,.05); }
.lm-qcard-editing { background: rgba(91,141,238,.06); border: 1px solid var(--accent); border-radius: 10px; padding: 8px; }
.lm-qcard-textarea { background: transparent; border: none; outline: none; resize: none; color: var(--text); font-family: 'Outfit', sans-serif; font-size: 14px; width: 100%; line-height: 1.6; }
.lm-qcard-edit-hint { font-size: 14px; flex-shrink: 0; opacity: .5; }
.lm-qcard-options { display: flex; flex-direction: column; gap: 8px; }
.lm-qcard-option { display: flex; align-items: center; gap: 12px; border-radius: 10px; padding: 11px 14px; }
.lm-qcard-option-letter { width: 26px; height: 26px; border-radius: 50%; background: rgba(255,255,255,.08); display: flex; align-items: center; justify-content: center; font-family: 'DM Mono', monospace; font-size: 11px; font-weight: 700; color: var(--text-muted); flex-shrink: 0; }
.lm-qcard-option-correct .lm-qcard-option-letter { background: rgba(16,185,129,.2); color: #10b981; }
.lm-qcard-option-correct { border-color: rgba(16,185,129,.25) !important; background: rgba(16,185,129,.05) !important; }
.lm-qcard-option-text { flex: 1; font-size: 13px; color: var(--text); }
.lm-qcard-correct-mark { font-size: 14px; color: #10b981; flex-shrink: 0; }
.lm-qcard-option-input { background: transparent; border: none; outline: none; color: var(--text); font-family: 'Outfit', sans-serif; font-size: 13px; flex: 1; }
.lm-qcard-fillin { display: flex; align-items: center; gap: 10px; border-radius: 10px; padding: 12px 14px; }
.lm-qcard-fillin-inline { flex: 1; }
.lm-qcard-fillin-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted); font-family: 'DM Mono', monospace; white-space: nowrap; }
.lm-qcard-fillin-val { font-size: 14px; color: #10b981; font-weight: 600; flex: 1; }
.lm-qcard-correct-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.lm-qcard-explanation { display: flex; flex-direction: column; gap: 6px; }
.lm-qcard-exp-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: var(--text-muted); font-family: 'DM Mono', monospace; }
.lm-qcard-exp-body { border-radius: 10px; padding: 12px 14px; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.lm-qcard-exp-text { font-size: 13px; color: var(--text-muted); line-height: 1.6; flex: 1; }

/* ── Conflict card ── */
.lm-conflict-card { background: rgba(239,68,68,.07); border: 1px solid rgba(239,68,68,.2); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.lm-conflict-card-title { font-size: 13px; font-weight: 700; color: #ef4444; }
.lm-conflict-versions { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.lm-conflict-col { display: flex; flex-direction: column; gap: 6px; }
.lm-conflict-col-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted); font-family: 'DM Mono', monospace; }
.lm-conflict-text { font-size: 13px; color: var(--text); line-height: 1.5; }
.lm-conflict-answer { font-size: 12px; color: var(--accent); }
.lm-conflict-actions { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.lm-conflict-or { font-size: 12px; color: var(--text-muted); }

/* ── Revert row ── */
.lm-revert-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: rgba(91,141,238,.06); border: 1px solid rgba(91,141,238,.15); border-radius: 10px; padding: 10px 14px; }
.lm-edit-badge { font-size: 12px; color: var(--accent); font-weight: 600; }

/* ── Buttons ── */
.lm-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 20px; min-height: 44px; border-radius: 10px; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; transition: background .13s, color .13s; border: 1px solid transparent; white-space: nowrap; text-decoration: none; }
.lm-btn:disabled { opacity: .55; cursor: not-allowed; }
.lm-btn-sm { padding: 7px 14px; min-height: 36px; font-size: 12px; }
.lm-btn-primary { background: var(--accent, #5b8dee); color: #fff; border-color: var(--accent); }
.lm-btn-primary:hover:not(:disabled) { filter: brightness(.88); }
.lm-btn-ghost { background: rgba(255,255,255,.05); border-color: rgba(255,255,255,.1); color: var(--text-muted); }
.lm-btn-ghost:hover:not(:disabled) { background: rgba(255,255,255,.1); color: var(--text); }

/* ── Misc ── */
.lm-err { font-size: 12px; color: #ef4444; padding: 8px 12px; background: rgba(239,68,68,.08); border-radius: 8px; }
.lm-empty { text-align: center; color: var(--text-muted); padding: 32px; font-size: 14px; }
.lm-loading { text-align: center; color: var(--text-muted); padding: 32px; font-size: 14px; }

/* ── Toast ── */
.lm-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); padding: 11px 22px; border-radius: 100px; font-size: 14px; font-weight: 600; z-index: 9999; animation: lm-toast-in .2s ease; box-shadow: 0 8px 32px rgba(0,0,0,.4); white-space: nowrap; pointer-events: none; }
.lm-toast-ok { background: #10b981; color: #fff; }
.lm-toast-err { background: #ef4444; color: #fff; }
@keyframes lm-toast-in { from { opacity: 0; transform: translateX(-50%) translateY(12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

/* ── Footer ── */
.lm-footer { border-top: 1px solid var(--border, rgba(255,255,255,0.08)); background: var(--surface, #13161d); }
.lm-footer-inner { padding: 24px 40px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; }
.lm-footer-logo { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 700; color: var(--text); }
.lm-footer-md { color: var(--accent, #5b8dee); }
.lm-footer-tagline { font-size: 12px; color: var(--text-muted); font-style: italic; }
.lm-footer-links { display: flex; gap: 20px; }
.lm-footer-link { font-size: 13px; color: var(--text-muted); text-decoration: none; transition: color .15s; }
.lm-footer-link:hover { color: var(--text); }

/* ── Mobile ── */
@media (max-width: 767px) {
  .lm-page-wrap { padding: 0 16px; }
  .lm-title-bar-bottom { flex-direction: column; align-items: flex-start; }
  .lm-expand-panel { padding: 16px; }
  .lm-meta-grid { grid-template-columns: 1fr; }
  .lm-conflict-versions { grid-template-columns: 1fr; }
  .lm-slides-grid { grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); }
  .lm-table th:nth-child(5), .lm-table td:nth-child(5),
  .lm-table th:nth-child(8), .lm-table td:nth-child(8) { display: none; }
  .lm-modal, .lm-modal-wide { padding: 20px; max-width: 100%; }
  .lm-footer-inner { padding: 20px 16px; flex-direction: column; align-items: flex-start; gap: 12px; }
}
`;
