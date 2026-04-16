'use client';
/**
 * app/app/lectures/LecturesClient.tsx
 * Full user-facing lecture management view.
 *
 * Displays ALL lectures in a dense table.
 * Click a row to expand inline with:
 *   - Metadata tab (user-editable: title, tags, block/group)
 *   - Flashcards tab (user overrides only — no raw JSON, no internal_id)
 *   - Exam Questions tab (same pattern)
 *   - Slides tab (thumbnails, upload, delete)
 *
 * Admin-only fields (internal_id, raw json_data, original_file) are
 * intentionally NEVER shown here.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';

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
  lecture: LectureSummary & { subtitle: string };
  flashcards: Flashcard[];
  questions: ExamQuestion[];
  conflictCount: number;
}

type TabId = 'meta' | 'flashcards' | 'questions' | 'slides';

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

const COURSE_COLORS: Record<string, string> = {
  'Physical Diagnosis I': '#5b8dee',
  'Anatomy & Physiology': '#10b981',
  'Laboratory Diagnosis': '#8b5cf6',
};

const TYPE_LABELS: Record<string, string> = {
  mcq: 'MCQ', tf: 'T/F', matching: 'Match', fillin: 'Fill',
};

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, type, onDone }: { msg: string; type: 'ok' | 'err'; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className={`lm-toast lm-toast-${type}`}>{msg}</div>
  );
}

// ─── Conflict Banner ──────────────────────────────────────────────────────────

function ConflictBanner({ count, lectureId, onResolved }: {
  count: number; lectureId: string; onResolved: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="lm-conflict-banner">
      <span className="lm-conflict-icon">⚠️</span>
      <span>
        <strong>{count} card{count !== 1 ? 's' : ''}</strong> were updated by your instructor since your last edit.
        Review them below — each flagged card lets you accept the new version or keep yours.
      </span>
    </div>
  );
}

// ─── Card Edit Modal ──────────────────────────────────────────────────────────

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
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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
    <div className="lm-overlay" onClick={onClose}>
      <div className="lm-modal" onClick={e => e.stopPropagation()}>
        <div className="lm-modal-header">
          <div>
            <div className="lm-modal-title">Edit Flashcard</div>
            <div className="lm-modal-sub">Your changes are personal — they won't affect other students.</div>
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
              <button className="lm-btn lm-btn-primary" onClick={acceptCanonical} disabled={saving}>
                ✓ Accept instructor's version
              </button>
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
            <button className="lm-btn lm-btn-ghost lm-btn-sm" onClick={revertToCanonical} disabled={saving}>
              Revert to original
            </button>
          </div>
        )}

        {err && <div className="lm-err">{err}</div>}

        <div className="lm-modal-footer">
          <button className="lm-btn lm-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="lm-btn lm-btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save My Edit'}
          </button>
        </div>
      </div>
    </div>
  );
}

function QuestionEditModal({ question, lectureId, onSave, onClose }: {
  question: ExamQuestion; lectureId: string; onSave: (updated: ExamQuestion) => void; onClose: () => void;
}) {
  const [q, setQ] = useState(question.question);
  const [ca, setCa] = useState(question.correctAnswer);
  const [exp, setExp] = useState(question.explanation);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!q.trim() || !ca.trim()) { setErr('Question and correct answer are required.'); return; }
    setSaving(true);
    try {
      await apiFetch(`/api/lectures/${lectureId}/questions/${question.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q.trim(), correctAnswer: ca.trim(), explanation: exp.trim() }),
      });
      onSave({ ...question, question: q.trim(), correctAnswer: ca.trim(), explanation: exp.trim(), hasUserEdit: true });
      onClose();
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  }

  async function acceptCanonical() {
    setSaving(true);
    try {
      await apiFetch(`/api/lectures/${lectureId}/questions/${question.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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

  return (
    <div className="lm-overlay" onClick={onClose}>
      <div className="lm-modal" onClick={e => e.stopPropagation()}>
        <div className="lm-modal-header">
          <div>
            <div className="lm-modal-title">Edit Question</div>
            <div className="lm-modal-sub">Your changes are personal — they won't affect other students.</div>
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
              <button className="lm-btn lm-btn-primary" onClick={acceptCanonical} disabled={saving}>
                ✓ Accept instructor's version
              </button>
              <span className="lm-conflict-or">or keep editing yours below</span>
            </div>
          </div>
        )}

        <div className="lm-form-field">
          <label className="lm-form-label">Question</label>
          <textarea className="lm-textarea" rows={3} value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="lm-form-field">
          <label className="lm-form-label">Correct Answer</label>
          <input className="lm-input" value={ca} onChange={e => setCa(e.target.value)} />
        </div>
        <div className="lm-form-field">
          <label className="lm-form-label">Explanation <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></label>
          <textarea className="lm-textarea" rows={2} value={exp} onChange={e => setExp(e.target.value)} />
        </div>

        {question.hasUserEdit && !question.hasConflict && (
          <div className="lm-revert-row">
            <span className="lm-edit-badge">✏️ You've edited this question</span>
            <button className="lm-btn lm-btn-ghost lm-btn-sm" onClick={revertToCanonical} disabled={saving}>
              Revert to original
            </button>
          </div>
        )}

        {err && <div className="lm-err">{err}</div>}

        <div className="lm-modal-footer">
          <button className="lm-btn lm-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="lm-btn lm-btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save My Edit'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Card Modal ───────────────────────────────────────────────────────────

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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q.trim(), answer: a.trim(), topic: topic.trim() || 'General' }),
      });
      onAdded({ id: data.card.id, topic: data.card.topic, slideNumber: null, question: data.card.question, answer: data.card.answer, hasUserEdit: false, hasConflict: false, userEditedAt: null });
      onClose();
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  }

  return (
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
  );
}

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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim(), correctAnswer: correct.trim(), type, topic: topic.trim() || 'General' }),
      });
      const q = data.question;
      onAdded({ id: q.id, type: q.type, topic: q.topic, slideNumber: null, question: q.question, correctAnswer: q.correct_answer, options: q.options ?? [], explanation: q.explanation ?? '', hasUserEdit: false, hasConflict: false, userEditedAt: null });
      onClose();
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  }

  return (
    <div className="lm-overlay" onClick={onClose}>
      <div className="lm-modal" onClick={e => e.stopPropagation()}>
        <div className="lm-modal-header">
          <div className="lm-modal-title">Add Exam Question</div>
          <button className="lm-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="lm-form-row">
          <div className="lm-form-field" style={{ flex: 1 }}>
            <label className="lm-form-label">Type</label>
            <select className="lm-select" value={type} onChange={e => setType(e.target.value)}>
              <option value="mcq">Multiple Choice</option>
              <option value="tf">True / False</option>
              <option value="matching">Matching</option>
              <option value="fillin">Fill in the blank</option>
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
  );
}

// ─── Slides Tab ───────────────────────────────────────────────────────────────

function SlidesTab({ lectureId, onToast }: { lectureId: string; onToast: (m: string, t: 'ok' | 'err') => void }) {
  const [slides, setSlides] = useState<SlideItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/lectures/${lectureId}/slides`);
      setSlides(data.slides ?? []);
    } catch (e: any) { onToast(e.message, 'err'); }
    setLoading(false);
  }, [lectureId, onToast]);

  useEffect(() => { load(); }, [load]);

  async function uploadFile(file: File) {
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    try {
      await fetch(`/api/lectures/${lectureId}/slides`, { method: 'POST', body: form });
      onToast('Slide uploaded.', 'ok');
      load();
    } catch (e: any) { onToast(e.message, 'err'); }
    setUploading(false);
  }

  async function deleteSlide(slideNum: number | null, name: string) {
    if (!slideNum) return;
    setDeleting(name);
    try {
      await apiFetch(`/api/lectures/${lectureId}/slides/${slideNum}`, { method: 'DELETE' });
      onToast('Slide deleted.', 'ok');
      setSlides(s => s.filter(sl => sl.name !== name));
    } catch (e: any) { onToast(e.message, 'err'); }
    setDeleting(null);
  }

  return (
    <div className="lm-slides-tab">
      <div className="lm-slides-header">
        <span className="lm-slides-count">{slides.length} slide{slides.length !== 1 ? 's' : ''}</span>
        <button
          className="lm-btn lm-btn-primary lm-btn-sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Uploading…' : '+ Upload Slide'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ''; }}
        />
      </div>

      {loading ? (
        <div className="lm-loading">Loading slides…</div>
      ) : slides.length === 0 ? (
        <div className="lm-empty-slides">
          <div style={{ fontSize: 32, marginBottom: 8 }}>🖼️</div>
          <div>No slides uploaded yet.</div>
          <div className="lm-muted">Slides uploaded here will appear in the study lightbox.</div>
        </div>
      ) : (
        <div className="lm-slides-grid">
          {slides.map(sl => (
            <div key={sl.name} className="lm-slide-card">
              {sl.url ? (
                <img src={sl.url} alt={sl.name} className="lm-slide-img" loading="lazy" />
              ) : (
                <div className="lm-slide-placeholder">🖼️</div>
              )}
              <div className="lm-slide-meta">
                <span className="lm-slide-num">
                  {sl.slideNumber != null ? `Slide ${sl.slideNumber}` : sl.name}
                </span>
                <span className="lm-slide-size">{fmtSize(sl.size)}</span>
              </div>
              <button
                className="lm-slide-delete"
                onClick={() => deleteSlide(sl.slideNumber, sl.name)}
                disabled={deleting === sl.name}
                aria-label="Delete slide"
              >
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

function ExpandedRow({
  summary,
  onClose,
  onToast,
}: {
  summary: LectureSummary;
  onClose: () => void;
  onToast: (m: string, t: 'ok' | 'err') => void;
}) {
  const [tab, setTab] = useState<TabId>('meta');
  const [detail, setDetail] = useState<LectureDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Meta editing
  const [customTitle, setCustomTitle] = useState(summary.customTitle ?? '');
  const [groupId, setGroupId] = useState(summary.groupId ?? '');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(summary.tags);
  const [savingMeta, setSavingMeta] = useState(false);

  // Card modals
  const [editingCard, setEditingCard] = useState<{ type: 'fc' | 'q'; item: Flashcard | ExamQuestion } | null>(null);
  const [addingCard, setAddingCard] = useState<'fc' | 'q' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/lectures/${summary.id}`);
      setDetail(data);
    } catch (e: any) { onToast(e.message, 'err'); }
    setLoading(false);
  }, [summary.id, onToast]);

  useEffect(() => { load(); }, [load]);

  async function saveMeta() {
    setSavingMeta(true);
    try {
      await apiFetch(`/api/lectures/${summary.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customTitle: customTitle.trim() || null, groupId: groupId.trim() || null, tags }),
      });
      onToast('Saved.', 'ok');
    } catch (e: any) { onToast(e.message, 'err'); }
    setSavingMeta(false);
  }

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags(p => [...p, t]);
    setTagInput('');
  }

  function updateFlashcard(updated: Flashcard) {
    setDetail(d => d ? { ...d, flashcards: d.flashcards.map(f => f.id === updated.id ? updated : f) } : d);
  }

  function updateQuestion(updated: ExamQuestion) {
    setDetail(d => d ? { ...d, questions: d.questions.map(q => q.id === updated.id ? updated : q) } : d);
  }

  function addFlashcard(card: Flashcard) {
    setDetail(d => d ? { ...d, flashcards: [...d.flashcards, card] } : d);
    onToast('Flashcard added.', 'ok');
  }

  function addQuestion(q: ExamQuestion) {
    setDetail(d => d ? { ...d, questions: [...d.questions, q] } : d);
    onToast('Question added.', 'ok');
  }

  const TABS: { id: TabId; label: string }[] = [
    { id: 'meta',       label: 'Metadata' },
    { id: 'flashcards', label: `Flashcards${detail ? ` (${detail.flashcards.length})` : ''}` },
    { id: 'questions',  label: `Exam Questions${detail ? ` (${detail.questions.length})` : ''}` },
    { id: 'slides',     label: `Slides${summary.slideCount > 0 ? ` (${summary.slideCount})` : ''}` },
  ];

  return (
    <tr>
      <td colSpan={8} className="lm-expand-cell">
        <div className="lm-expand-panel">
          {/* Tab bar */}
          <div className="lm-tabs">
            {TABS.map(t => (
              <button
                key={t.id}
                className={`lm-tab ${tab === t.id ? 'lm-tab-active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {t.id !== 'meta' && t.id !== 'slides' && detail?.conflictCount && tab !== t.id
                  ? <span className="lm-tab-conflict">!</span>
                  : null}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="lm-loading">Loading…</div>
          ) : (
            <>
              {detail && <ConflictBanner count={detail.conflictCount} lectureId={summary.id} onResolved={load} />}

              {/* ── Metadata Tab ── */}
              {tab === 'meta' && (
                <div className="lm-meta-grid">
                  <div className="lm-form-field">
                    <label className="lm-form-label">Custom Title</label>
                    <input
                      className="lm-input"
                      value={customTitle}
                      onChange={e => setCustomTitle(e.target.value)}
                      placeholder={summary.title}
                    />
                    <div className="lm-field-hint">Override the displayed title for yourself only.</div>
                  </div>
                  <div className="lm-form-field">
                    <label className="lm-form-label">Block / Group</label>
                    <input
                      className="lm-input"
                      value={groupId}
                      onChange={e => setGroupId(e.target.value)}
                      placeholder="e.g. Fall 2026 Block 1"
                    />
                    <div className="lm-field-hint">Organize this lecture into a custom study block.</div>
                  </div>
                  <div className="lm-form-field lm-form-field-full">
                    <label className="lm-form-label">Tags</label>
                    <div className="lm-tag-editor">
                      {tags.map(tag => (
                        <span key={tag} className="lm-tag">
                          {tag}
                          <button className="lm-tag-remove" onClick={() => setTags(t => t.filter(x => x !== tag))}>✕</button>
                        </span>
                      ))}
                      <input
                        className="lm-tag-input"
                        value={tagInput}
                        onChange={e => setTagInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
                        placeholder="Add tag…"
                      />
                    </div>
                  </div>
                  <div className="lm-form-field lm-form-field-full">
                    <div className="lm-readonly-info">
                      <div><span className="lm-readonly-label">Course</span><span className="lm-readonly-val">{summary.course}</span></div>
                      <div><span className="lm-readonly-label">Slides</span><span className="lm-readonly-val">{summary.slideCount}</span></div>
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

              {/* ── Flashcards Tab ── */}
              {tab === 'flashcards' && detail && (
                <div>
                  {detail.flashcards.length === 0 ? (
                    <div className="lm-empty">No flashcards in this lecture yet.</div>
                  ) : (
                    <div className="lm-card-table-wrap">
                      <table className="lm-card-table">
                        <thead>
                          <tr>
                            <th>Topic</th>
                            <th>Question</th>
                            <th>Answer</th>
                            <th>Slide</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.flashcards.map(card => (
                            <tr
                              key={card.id}
                              className={`lm-card-row ${card.hasConflict ? 'lm-card-conflict' : card.hasUserEdit ? 'lm-card-edited' : ''}`}
                              onClick={() => setEditingCard({ type: 'fc', item: card })}
                            >
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
                    <button className="lm-btn lm-btn-ghost lm-btn-sm" onClick={() => setAddingCard('fc')}>
                      + Add Flashcard
                    </button>
                  </div>
                </div>
              )}

              {/* ── Exam Questions Tab ── */}
              {tab === 'questions' && detail && (
                <div>
                  {detail.questions.length === 0 ? (
                    <div className="lm-empty">No exam questions in this lecture yet.</div>
                  ) : (
                    <div className="lm-card-table-wrap">
                      <table className="lm-card-table">
                        <thead>
                          <tr>
                            <th>Type</th>
                            <th>Topic</th>
                            <th>Question</th>
                            <th>Correct Answer</th>
                            <th>Slide</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.questions.map(q => (
                            <tr
                              key={q.id}
                              className={`lm-card-row ${q.hasConflict ? 'lm-card-conflict' : q.hasUserEdit ? 'lm-card-edited' : ''}`}
                              onClick={() => setEditingCard({ type: 'q', item: q })}
                            >
                              <td>
                                <span className="lm-type-badge">{TYPE_LABELS[q.type] ?? q.type}</span>
                              </td>
                              <td className="lm-card-topic">{q.topic}</td>
                              <td className="lm-card-preview">{q.question}</td>
                              <td className="lm-card-preview lm-card-answer">{q.correctAnswer}</td>
                              <td className="lm-card-slide">{q.slideNumber ?? '—'}</td>
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
                    <button className="lm-btn lm-btn-ghost lm-btn-sm" onClick={() => setAddingCard('q')}>
                      + Add Exam Question
                    </button>
                  </div>
                </div>
              )}

              {/* ── Slides Tab ── */}
              {tab === 'slides' && (
                <SlidesTab lectureId={summary.id} onToast={onToast} />
              )}
            </>
          )}
        </div>

        {/* Card edit modals */}
        {editingCard?.type === 'fc' && (
          <FlashcardEditModal
            card={editingCard.item as Flashcard}
            lectureId={summary.id}
            onSave={updated => { updateFlashcard(updated); setEditingCard(null); }}
            onClose={() => setEditingCard(null)}
          />
        )}
        {editingCard?.type === 'q' && (
          <QuestionEditModal
            question={editingCard.item as ExamQuestion}
            lectureId={summary.id}
            onSave={updated => { updateQuestion(updated); setEditingCard(null); }}
            onClose={() => setEditingCard(null)}
          />
        )}
        {addingCard === 'fc' && (
          <AddFlashcardModal
            lectureId={summary.id}
            onAdded={card => { addFlashcard(card); setAddingCard(null); }}
            onClose={() => setAddingCard(null)}
          />
        )}
        {addingCard === 'q' && (
          <AddQuestionModal
            lectureId={summary.id}
            onAdded={q => { addQuestion(q); setAddingCard(null); }}
            onClose={() => setAddingCard(null)}
          />
        )}
      </td>
    </tr>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LecturesClient({ initialLectures }: { initialLectures: LectureSummary[] }) {
  const [lectures] = useState<LectureSummary[]>(initialLectures);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState<string>('all');

  const showToast = useCallback((msg: string, type: 'ok' | 'err') => setToast({ msg, type }), []);

  const courses = [...new Set(initialLectures.map(l => l.course))].sort();

  const filtered = lectures.filter(l => {
    const matchesCourse = courseFilter === 'all' || l.course === courseFilter;
    const matchesSearch = !search || l.title.toLowerCase().includes(search.toLowerCase()) || l.course.toLowerCase().includes(search.toLowerCase());
    return matchesCourse && matchesSearch;
  });

  return (
    <>
      <style>{CSS}</style>
      <div className="lm-root">

        {/* Header */}
        <div className="lm-header">
          <div className="lm-header-left">
            <Link href="/app" className="lm-back">← Dashboard</Link>
            <h1 className="lm-title">My Lectures</h1>
            <span className="lm-count">{lectures.length} lecture{lectures.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="lm-header-right">
            <input
              className="lm-search"
              placeholder="Search lectures…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select
              className="lm-filter-select"
              value={courseFilter}
              onChange={e => setCourseFilter(e.target.value)}
            >
              <option value="all">All Courses</option>
              {courses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="lm-table-wrap">
          <table className="lm-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>Lecture</th>
                <th>Course</th>
                <th style={{ width: 80, textAlign: 'center' }}>Slides</th>
                <th style={{ width: 100, textAlign: 'center' }}>Flashcards</th>
                <th style={{ width: 100, textAlign: 'center' }}>Questions</th>
                <th style={{ width: 130 }}>Added</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="lm-empty-row">No lectures match your filters.</td></tr>
              )}
              {filtered.map(l => (
                <React.Fragment key={l.id}>
                  <tr
                    className={`lm-row ${expanded === l.id ? 'lm-row-open' : ''}`}
                    onClick={() => setExpanded(expanded === l.id ? null : l.id)}
                  >
                    <td className="lm-row-icon">{l.icon}</td>
                    <td className="lm-row-title-cell">
                      <div className="lm-row-title">{l.title}</div>
                      {l.subtitle && <div className="lm-row-subtitle">{l.subtitle}</div>}
                      {l.tags.length > 0 && (
                        <div className="lm-row-tags">
                          {l.tags.slice(0, 3).map(t => <span key={t} className="lm-row-tag">{t}</span>)}
                          {l.tags.length > 3 && <span className="lm-row-tag lm-row-tag-more">+{l.tags.length - 3}</span>}
                        </div>
                      )}
                    </td>
                    <td>
                      <span
                        className="lm-course-pill"
                        style={{ background: `${COURSE_COLORS[l.course] ?? '#5b8dee'}18`, color: COURSE_COLORS[l.course] ?? '#5b8dee' }}
                      >
                        {l.course}
                      </span>
                    </td>
                    <td className="lm-num-cell">{l.slideCount}</td>
                    <td className="lm-num-cell" style={{ color: 'var(--accent)' }}>{l.flashcardCount}</td>
                    <td className="lm-num-cell" style={{ color: '#8b5cf6' }}>{l.questionCount}</td>
                    <td className="lm-muted lm-date-cell">{fmt(l.createdAt)}</td>
                    <td className="lm-chevron-cell">
                      <span className="lm-chevron">{expanded === l.id ? '▲' : '▼'}</span>
                    </td>
                  </tr>

                  {expanded === l.id && (
                    <ExpandedRow
                      summary={l}
                      onClose={() => setExpanded(null)}
                      onToast={showToast}
                    />
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      </div>
    </>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
/* Layout */
.lm-root { min-height: 100vh; background: var(--bg, #0d0f14); color: var(--text, #e8eaf0); font-family: 'Outfit', sans-serif; padding: 0; }

/* Header */
.lm-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 24px 32px 20px; flex-wrap: wrap; border-bottom: 1px solid var(--border, rgba(255,255,255,0.08)); }
.lm-header-left { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.lm-header-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.lm-back { font-size: 13px; color: var(--text-muted, #6b7280); text-decoration: none; transition: color .15s; }
.lm-back:hover { color: var(--accent, #5b8dee); }
.lm-title { font-family: 'Fraunces', serif; font-size: 26px; font-weight: 700; margin: 0; }
.lm-count { font-size: 12px; color: var(--text-muted); background: rgba(255,255,255,.07); border-radius: 100px; padding: 2px 10px; font-family: 'DM Mono', monospace; }
.lm-search { background: var(--surface, #13161d); border: 1px solid var(--border); border-radius: 10px; color: var(--text); font-family: 'Outfit', sans-serif; font-size: 13px; padding: 9px 14px; outline: none; min-width: 200px; min-height: 40px; }
.lm-search:focus { border-color: var(--accent); }
.lm-filter-select { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; color: var(--text); font-family: 'Outfit', sans-serif; font-size: 13px; padding: 9px 12px; outline: none; min-height: 40px; cursor: pointer; }
.lm-filter-select:focus { border-color: var(--accent); }

/* Table */
.lm-table-wrap { overflow-x: auto; }
.lm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.lm-table th { padding: 10px 16px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted); border-bottom: 1px solid var(--border); background: rgba(255,255,255,.02); white-space: nowrap; }
.lm-table td { padding: 13px 16px; border-bottom: 1px solid rgba(255,255,255,.04); vertical-align: middle; }
.lm-row { cursor: pointer; transition: background .12s; }
.lm-row:hover { background: rgba(255,255,255,.025); }
.lm-row-open { background: rgba(91,141,238,.05) !important; border-bottom: none; }
.lm-row-icon { font-size: 20px; width: 40px; text-align: center; }
.lm-row-title-cell { min-width: 200px; }
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

/* Expanded Panel */
.lm-expand-cell { padding: 0 !important; background: var(--surface, #13161d); border-bottom: 2px solid rgba(91,141,238,.25) !important; }
.lm-expand-panel { padding: 24px 32px 28px; }

/* Tabs */
.lm-tabs { display: flex; gap: 2px; margin-bottom: 20px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
.lm-tab { background: none; border: none; padding: 9px 18px; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500; color: var(--text-muted); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color .13s, border-color .13s; min-height: 44px; border-radius: 8px 8px 0 0; position: relative; }
.lm-tab:hover { color: var(--text); }
.lm-tab-active { color: var(--accent, #5b8dee) !important; border-bottom-color: var(--accent) !important; font-weight: 600; }
.lm-tab-conflict { position: absolute; top: 6px; right: 6px; background: #ef4444; color: #fff; font-size: 9px; font-weight: 700; border-radius: 50%; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; }

/* Conflict Banner */
.lm-conflict-banner { display: flex; gap: 12px; align-items: flex-start; background: rgba(239,68,68,.08); border: 1px solid rgba(239,68,68,.25); border-radius: 12px; padding: 14px 18px; margin-bottom: 20px; font-size: 13px; line-height: 1.6; color: var(--text); }
.lm-conflict-icon { font-size: 18px; flex-shrink: 0; }

/* Meta grid */
.lm-meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.lm-form-field { display: flex; flex-direction: column; gap: 6px; }
.lm-form-field-full { grid-column: 1 / -1; }
.lm-form-row { display: flex; gap: 12px; align-items: flex-start; }
.lm-form-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted); font-family: 'DM Mono', monospace; }
.lm-field-hint { font-size: 11px; color: var(--text-muted); opacity: 0.7; }
.lm-input { background: var(--bg, #0d0f14); border: 1px solid var(--border); border-radius: 10px; color: var(--text); font-family: 'Outfit', sans-serif; font-size: 13px; padding: 10px 14px; outline: none; min-height: 44px; width: 100%; }
.lm-input:focus { border-color: var(--accent); }
.lm-select { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; color: var(--text); font-family: 'Outfit', sans-serif; font-size: 13px; padding: 10px 14px; outline: none; min-height: 44px; width: 100%; cursor: pointer; }
.lm-select:focus { border-color: var(--accent); }

/* Tag editor */
.lm-tag-editor { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px; min-height: 44px; }
.lm-tag { display: inline-flex; align-items: center; gap: 5px; background: rgba(91,141,238,.12); color: var(--accent); border-radius: 100px; padding: 3px 10px 3px 10px; font-size: 12px; font-weight: 600; }
.lm-tag-remove { background: none; border: none; color: inherit; cursor: pointer; font-size: 10px; padding: 0; opacity: 0.7; }
.lm-tag-remove:hover { opacity: 1; }
.lm-tag-input { background: none; border: none; outline: none; color: var(--text); font-family: 'Outfit', sans-serif; font-size: 13px; min-width: 100px; flex: 1; }

/* Readonly info strip */
.lm-readonly-info { display: flex; gap: 24px; flex-wrap: wrap; background: rgba(255,255,255,.02); border: 1px solid var(--border); border-radius: 10px; padding: 12px 16px; }
.lm-readonly-label { font-size: 11px; color: var(--text-muted); margin-right: 6px; text-transform: uppercase; letter-spacing: .06em; font-family: 'DM Mono', monospace; }
.lm-readonly-val { font-size: 13px; color: var(--text); font-weight: 500; }

/* Card tables */
.lm-card-table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; max-height: 420px; overflow-y: auto; }
.lm-card-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.lm-card-table th { padding: 9px 14px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted); border-bottom: 1px solid var(--border); background: rgba(255,255,255,.02); position: sticky; top: 0; z-index: 2; white-space: nowrap; }
.lm-card-table td { padding: 11px 14px; border-bottom: 1px solid rgba(255,255,255,.04); vertical-align: top; }
.lm-card-row { cursor: pointer; transition: background .1s; }
.lm-card-row:hover { background: rgba(255,255,255,.025); }
.lm-card-row:last-child td { border-bottom: none; }
.lm-card-edited { background: rgba(91,141,238,.04); }
.lm-card-conflict { background: rgba(239,68,68,.05); }
.lm-card-topic { color: var(--text-muted); font-size: 11px; white-space: nowrap; max-width: 100px; overflow: hidden; text-overflow: ellipsis; }
.lm-card-preview { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); line-height: 1.4; }
.lm-card-answer { color: var(--accent, #5b8dee); }
.lm-card-slide { color: var(--text-muted); font-family: 'DM Mono', monospace; font-size: 11px; text-align: center; }
.lm-card-actions { white-space: nowrap; }
.lm-badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 100px; font-size: 10px; font-weight: 700; }
.lm-badge-conflict { background: rgba(239,68,68,.15); color: #ef4444; }
.lm-badge-edit { background: rgba(91,141,238,.12); color: var(--accent); }
.lm-edit-hint { font-size: 11px; color: var(--text-muted); margin-left: 6px; }
.lm-type-badge { display: inline-flex; padding: 2px 8px; border-radius: 100px; font-size: 10px; font-weight: 700; background: rgba(139,92,246,.12); color: #8b5cf6; }
.lm-add-row { padding: 12px 0 4px; display: flex; justify-content: flex-end; }

/* Slides tab */
.lm-slides-tab { }
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
.lm-empty-slides { text-align: center; padding: 40px; color: var(--text-muted); font-size: 14px; line-height: 2; }

/* Modals */
.lm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.65); backdrop-filter: blur(4px); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; }
.lm-modal { background: var(--surface, #13161d); border: 1px solid rgba(255,255,255,.12); border-radius: 20px; padding: 28px 32px; max-width: 560px; width: 100%; box-shadow: 0 24px 64px rgba(0,0,0,.6); animation: lm-modal-in .18s ease; max-height: 90vh; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }
@keyframes lm-modal-in { from { opacity: 0; transform: scale(.95); } to { opacity: 1; transform: scale(1); } }
.lm-modal-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.lm-modal-title { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 700; }
.lm-modal-sub { font-size: 12px; color: var(--text-muted); margin-top: 3px; }
.lm-modal-close { background: none; border: none; color: var(--text-muted); font-size: 16px; cursor: pointer; padding: 4px; flex-shrink: 0; }
.lm-modal-close:hover { color: var(--text); }
.lm-textarea { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; color: var(--text); font-family: 'Outfit', sans-serif; font-size: 13px; padding: 10px 14px; outline: none; width: 100%; resize: vertical; line-height: 1.6; }
.lm-textarea:focus { border-color: var(--accent); }
.lm-modal-footer { display: flex; gap: 10px; justify-content: flex-end; margin-top: 4px; }

/* Conflict card */
.lm-conflict-card { background: rgba(239,68,68,.07); border: 1px solid rgba(239,68,68,.2); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.lm-conflict-card-title { font-size: 13px; font-weight: 700; color: #ef4444; }
.lm-conflict-versions { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.lm-conflict-col { display: flex; flex-direction: column; gap: 6px; }
.lm-conflict-col-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted); font-family: 'DM Mono', monospace; }
.lm-conflict-text { font-size: 13px; color: var(--text); line-height: 1.5; }
.lm-conflict-answer { font-size: 12px; color: var(--accent); }
.lm-conflict-actions { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.lm-conflict-or { font-size: 12px; color: var(--text-muted); }

/* Edit badge / revert */
.lm-revert-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: rgba(91,141,238,.06); border: 1px solid rgba(91,141,238,.15); border-radius: 10px; padding: 10px 14px; }
.lm-edit-badge { font-size: 12px; color: var(--accent); font-weight: 600; }

/* Buttons */
.lm-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 20px; min-height: 44px; border-radius: 10px; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; transition: background .13s, color .13s; border: 1px solid transparent; white-space: nowrap; }
.lm-btn:disabled { opacity: .55; cursor: not-allowed; }
.lm-btn-sm { padding: 7px 14px; min-height: 36px; font-size: 12px; }
.lm-btn-primary { background: var(--accent, #5b8dee); color: #fff; border-color: var(--accent); }
.lm-btn-primary:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 82%, black); }
.lm-btn-ghost { background: rgba(255,255,255,.05); border-color: rgba(255,255,255,.1); color: var(--text-muted); }
.lm-btn-ghost:hover:not(:disabled) { background: rgba(255,255,255,.1); color: var(--text); }

/* Misc */
.lm-err { font-size: 12px; color: #ef4444; padding: 8px 12px; background: rgba(239,68,68,.08); border-radius: 8px; }
.lm-empty { text-align: center; color: var(--text-muted); padding: 32px; font-size: 14px; }
.lm-loading { text-align: center; color: var(--text-muted); padding: 32px; font-size: 14px; }

/* Toast */
.lm-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); padding: 11px 22px; border-radius: 100px; font-size: 14px; font-weight: 600; z-index: 9999; animation: lm-toast-in .2s ease; box-shadow: 0 8px 32px rgba(0,0,0,.4); white-space: nowrap; }
.lm-toast-ok { background: #10b981; color: #fff; }
.lm-toast-err { background: #ef4444; color: #fff; }
@keyframes lm-toast-in { from { opacity: 0; transform: translateX(-50%) translateY(12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

/* Mobile */
@media (max-width: 767px) {
  .lm-header { padding: 16px; }
  .lm-expand-panel { padding: 16px; }
  .lm-meta-grid { grid-template-columns: 1fr; }
  .lm-conflict-versions { grid-template-columns: 1fr; }
  .lm-slides-grid { grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); }
  .lm-table th:nth-child(4), .lm-table td:nth-child(4),
  .lm-table th:nth-child(7), .lm-table td:nth-child(7) { display: none; }
  .lm-modal { padding: 20px; }
}
`;
