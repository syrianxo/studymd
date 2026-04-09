// components/study/ExamView.tsx
'use client';

import { useState, useCallback, useEffect } from 'react';
import ToastContainer from './ToastContainer';
import { useToast } from '@/hooks/useToast';

// ── Types ────────────────────────────────────────────────────────────────────

export type QuestionType = 'mcq' | 'tf' | 'matching' | 'fillin';

export interface ExamQuestion {
  id: string;
  type: QuestionType;
  question: string;
  topic: string;
  // MCQ
  options?: string[];
  correct_answer: string;
  // Matching: pairs where correct_answer is a JSON map { leftItem: rightItem }
  // fillin: correct_answer is the expected string (case-insensitive match)
  explanation?: string;
}

export interface ExamSessionConfig {
  lectureTitle: string;
  lectureId: string;
  questions: ExamQuestion[];
  onExit: () => void;
  onSessionComplete?: (score: number, correct: number, total: number) => void;
}

// ── Per-question answer state ────────────────────────────────────────────────

interface AnswerState {
  // MCQ / TF
  selected?: string;
  // Fillin
  fillinValue?: string;
  // Matching: map from left-item → chosen right-item
  matchPairs?: Record<string, string>;
  matchSelectedLeft?: string | null;
  // Post-submit
  isCorrect?: boolean;
}

// ── Grade label ──────────────────────────────────────────────────────────────
function gradeLabel(pct: number): string {
  if (pct >= 90) return 'Excellent!';
  if (pct >= 80) return 'Great work.';
  if (pct >= 70) return 'Solid effort.';
  if (pct >= 60) return 'Keep studying.';
  return 'More review needed.';
}

function gradeColor(pct: number): string {
  if (pct >= 80) return 'var(--success)';
  if (pct >= 60) return 'var(--warning)';
  return 'var(--danger)';
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ExamView({
  lectureTitle,
  lectureId,
  questions,
  onExit,
  onSessionComplete,
}: ExamSessionConfig) {
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [submitted, setSubmitted] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [score, setScore] = useState<{ correct: number; total: number; pct: number } | null>(null);

  const { toasts, addToast } = useToast();

  const answeredCount = Object.keys(answers).filter((id) => {
    const a = answers[id];
    const q = questions.find((q) => q.id === id);
    if (!q) return false;
    if (q.type === 'fillin') return (a.fillinValue?.trim().length ?? 0) > 0;
    if (q.type === 'matching') return Object.keys(a.matchPairs ?? {}).length > 0;
    return !!a.selected;
  }).length;

  // ── Answer setters ─────────────────────────────────────────────────────
  function setMCQ(qId: string, option: string) {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [qId]: { selected: option } }));
  }

  function setTF(qId: string, value: 'True' | 'False') {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [qId]: { selected: value } }));
  }

  function setFillin(qId: string, value: string) {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [qId]: { fillinValue: value } }));
  }

  function handleMatchLeft(qId: string, leftItem: string) {
    if (submitted) return;
    setAnswers((prev) => {
      const existing = prev[qId] ?? {};
      const pairs = existing.matchPairs ?? {};
      // If already matched, unselect
      if (pairs[leftItem] !== undefined) {
        const newPairs = { ...pairs };
        delete newPairs[leftItem];
        return { ...prev, [qId]: { ...existing, matchPairs: newPairs, matchSelectedLeft: null } };
      }
      return { ...prev, [qId]: { ...existing, matchSelectedLeft: leftItem } };
    });
  }

  function handleMatchRight(qId: string, rightItem: string) {
    if (submitted) return;
    setAnswers((prev) => {
      const existing = prev[qId] ?? {};
      const selectedLeft = existing.matchSelectedLeft;
      if (!selectedLeft) return prev;
      const newPairs = { ...(existing.matchPairs ?? {}), [selectedLeft]: rightItem };
      return {
        ...prev,
        [qId]: { ...existing, matchPairs: newPairs, matchSelectedLeft: null },
      };
    });
  }

  // ── Grade ──────────────────────────────────────────────────────────────
  function submitExam() {
    if (answeredCount === 0) {
      addToast('Answer at least one question first.', 'error');
      return;
    }

    let correct = 0;
    const gradedAnswers: Record<string, AnswerState> = {};

    for (const q of questions) {
      const a = answers[q.id] ?? {};
      let isCorrect = false;

      if (q.type === 'mcq') {
        isCorrect = a.selected === q.correct_answer;
      } else if (q.type === 'tf') {
        isCorrect = a.selected === q.correct_answer;
      } else if (q.type === 'fillin') {
        isCorrect =
          (a.fillinValue?.trim().toLowerCase() ?? '') ===
          q.correct_answer.trim().toLowerCase();
      } else if (q.type === 'matching') {
        // correct_answer is JSON: { "term": "definition", ... }
        try {
          const correctMap = JSON.parse(q.correct_answer) as Record<string, string>;
          const pairs = a.matchPairs ?? {};
          isCorrect =
            Object.entries(correctMap).every(([k, v]) => pairs[k] === v) &&
            Object.keys(pairs).length === Object.keys(correctMap).length;
        } catch {
          isCorrect = false;
        }
      }

      if (isCorrect) correct++;
      gradedAnswers[q.id] = { ...a, isCorrect };
    }

    const pct = Math.round((correct / questions.length) * 100);
    setAnswers(gradedAnswers);
    setSubmitted(true);
    setScore({ correct, total: questions.length, pct });
    onSessionComplete?.(pct, correct, questions.length);

    // Scroll to results
    setTimeout(() => {
      document.getElementById('smd-exam-results')?.scrollIntoView({ behavior: 'smooth' });
    }, 200);
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="smd-study-view">
      {/* Header */}
      <div className="smd-study-header">
        <div style={{ minWidth: 0 }}>
          <div className="smd-study-title">Practice Exam — {lectureTitle}</div>
          <div className="smd-study-subtitle">
            {submitted
              ? `Exam submitted · ${score?.correct}/${score?.total} correct`
              : `${answeredCount} / ${questions.length} answered`}
          </div>
        </div>
        <div className="smd-study-progress-info">
          <div className="smd-card-counter">
            {answeredCount} answered
          </div>
          <button
            className="btn btn-ghost"
            onClick={onExit}
            style={{ padding: '8px 13px', fontSize: 13 }}
          >
            ✕ Exit
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="smd-exam-body">
        {questions.map((q, i) => (
          <QuestionBlock
            key={q.id}
            question={q}
            index={i}
            answer={answers[q.id] ?? {}}
            submitted={submitted}
            onMCQ={(opt) => setMCQ(q.id, opt)}
            onTF={(val) => setTF(q.id, val)}
            onFillin={(val) => setFillin(q.id, val)}
            onMatchLeft={(item) => handleMatchLeft(q.id, item)}
            onMatchRight={(item) => handleMatchRight(q.id, item)}
          />
        ))}

        {/* Submit / Cancel */}
        {!submitted && (
          <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
            <button className="btn btn-exam btn-lg" onClick={submitExam}>
              Submit Exam →
            </button>
            <button className="btn btn-ghost" onClick={onExit}>
              Cancel
            </button>
          </div>
        )}

        {/* Results panel */}
        {submitted && score && (
          <div className="smd-exam-results" id="smd-exam-results">
            <div
              className="smd-results-score"
              style={{ color: gradeColor(score.pct) }}
            >
              {score.pct}%
            </div>
            <div className="smd-results-grade">{gradeLabel(score.pct)}</div>
            <div className="smd-results-breakdown">
              <div className="smd-result-stat">
                <div className="smd-result-stat-value success">{score.correct}</div>
                <div className="smd-result-stat-label">Correct</div>
              </div>
              <div className="smd-result-stat">
                <div className="smd-result-stat-value danger">{score.total - score.correct}</div>
                <div className="smd-result-stat-label">Incorrect</div>
              </div>
              <div className="smd-result-stat">
                <div className="smd-result-stat-value">{score.total}</div>
                <div className="smd-result-stat-label">Total</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              {!reviewing && (
                <button
                  className="btn btn-primary btn-lg"
                  onClick={() => setReviewing(true)}
                >
                  Review Answers
                </button>
              )}
              <button className="btn btn-ghost btn-lg" onClick={onExit}>
                Dashboard
              </button>
            </div>
          </div>
        )}
      </div>

      <ToastContainer toasts={toasts} />
    </div>
  );
}

// ── Question block ────────────────────────────────────────────────────────────

const TYPE_BADGE_STYLES: Record<QuestionType, React.CSSProperties> = {
  mcq:      { background: 'rgba(91,141,238,.15)', color: 'var(--accent)', border: '1px solid rgba(91,141,238,.25)' },
  tf:       { background: 'rgba(16,185,129,.15)', color: 'var(--success)', border: '1px solid rgba(16,185,129,.25)' },
  matching: { background: 'rgba(240,192,64,.12)', color: 'var(--gold)', border: '1px solid rgba(240,192,64,.25)' },
  fillin:   { background: 'rgba(139,92,246,.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,.25)' },
};

const TYPE_LABELS: Record<QuestionType, string> = {
  mcq: 'Multiple Choice',
  tf: 'True / False',
  matching: 'Matching',
  fillin: 'Fill in Blank',
};

interface QuestionBlockProps {
  question: ExamQuestion;
  index: number;
  answer: AnswerState;
  submitted: boolean;
  onMCQ: (opt: string) => void;
  onTF: (val: 'True' | 'False') => void;
  onFillin: (val: string) => void;
  onMatchLeft: (item: string) => void;
  onMatchRight: (item: string) => void;
}

function QuestionBlock({
  question: q,
  index,
  answer,
  submitted,
  onMCQ,
  onTF,
  onFillin,
  onMatchLeft,
  onMatchRight,
}: QuestionBlockProps) {
  const isAnswered =
    q.type === 'fillin'
      ? (answer.fillinValue?.trim().length ?? 0) > 0
      : q.type === 'matching'
      ? Object.keys(answer.matchPairs ?? {}).length > 0
      : !!answer.selected;

  return (
    <div className={`smd-exam-question${isAnswered || submitted ? ' answered' : ''}`}>
      {/* Header */}
      <div className="smd-q-header">
        <span className="smd-q-number">Q{index + 1}</span>
        <span className="smd-q-type-badge" style={TYPE_BADGE_STYLES[q.type]}>
          {TYPE_LABELS[q.type]}
        </span>
        <span className="smd-q-topic-tag">{q.topic}</span>
      </div>

      <div className="smd-q-text">{q.question}</div>

      {/* Question body by type */}
      {q.type === 'mcq' && (
        <MCQInput
          options={q.options ?? []}
          selected={answer.selected}
          correctAnswer={q.correct_answer}
          submitted={submitted}
          onSelect={onMCQ}
        />
      )}

      {q.type === 'tf' && (
        <TFInput
          selected={answer.selected}
          correctAnswer={q.correct_answer}
          submitted={submitted}
          onSelect={onTF}
        />
      )}

      {q.type === 'fillin' && (
        <FillinInput
          value={answer.fillinValue ?? ''}
          correctAnswer={q.correct_answer}
          isCorrect={answer.isCorrect}
          submitted={submitted}
          onChange={onFillin}
        />
      )}

      {q.type === 'matching' && (
        <MatchingInput
          correctAnswer={q.correct_answer}
          pairs={answer.matchPairs ?? {}}
          selectedLeft={answer.matchSelectedLeft ?? null}
          submitted={submitted}
          onSelectLeft={onMatchLeft}
          onSelectRight={onMatchRight}
        />
      )}

      {/* Explanation */}
      {submitted && q.explanation && (
        <div className="smd-explanation-box visible">
          <div className="smd-explanation-label">Explanation</div>
          <div className="smd-explanation-text">{q.explanation}</div>
        </div>
      )}

      {/* Correct answer reveal for wrong answers */}
      {submitted && answer.isCorrect === false && q.type !== 'matching' && (
        <div className="smd-explanation-box visible" style={{ marginTop: 8 }}>
          <div className="smd-explanation-label" style={{ color: 'var(--success)' }}>
            Correct Answer
          </div>
          <div className="smd-explanation-text">{q.correct_answer}</div>
        </div>
      )}
    </div>
  );
}

// ── MCQ ──────────────────────────────────────────────────────────────────────

function MCQInput({
  options,
  selected,
  correctAnswer,
  submitted,
  onSelect,
}: {
  options: string[];
  selected?: string;
  correctAnswer: string;
  submitted: boolean;
  onSelect: (opt: string) => void;
}) {
  const letters = 'ABCDEFGHIJ';

  function getClass(opt: string) {
    if (!submitted) return opt === selected ? 'selected' : '';
    if (opt === correctAnswer) return 'correct';
    if (opt === selected && opt !== correctAnswer) return 'incorrect';
    return '';
  }

  return (
    <div className="smd-mcq-options">
      {options.map((opt, i) => (
        <div
          key={opt}
          className={`smd-mcq-option${getClass(opt) ? ` ${getClass(opt)}` : ''}${submitted ? ' disabled' : ''}`}
          onClick={() => onSelect(opt)}
        >
          <span className="smd-option-letter">{letters[i]}</span>
          {opt}
        </div>
      ))}
    </div>
  );
}

// ── True/False ────────────────────────────────────────────────────────────────

function TFInput({
  selected,
  correctAnswer,
  submitted,
  onSelect,
}: {
  selected?: string;
  correctAnswer: string;
  submitted: boolean;
  onSelect: (val: 'True' | 'False') => void;
}) {
  function getClass(val: string) {
    if (!submitted) return val === selected ? 'selected' : '';
    if (val === correctAnswer) return 'correct';
    if (val === selected && val !== correctAnswer) return 'incorrect';
    return '';
  }

  return (
    <div className="smd-tf-options">
      {(['True', 'False'] as const).map((val) => (
        <div
          key={val}
          className={`smd-tf-btn${getClass(val) ? ` ${getClass(val)}` : ''}${submitted ? ' disabled' : ''}`}
          onClick={() => onSelect(val)}
        >
          {val === 'True' ? '✓ True' : '✗ False'}
        </div>
      ))}
    </div>
  );
}

// ── Fill-in ───────────────────────────────────────────────────────────────────

function FillinInput({
  value,
  correctAnswer,
  isCorrect,
  submitted,
  onChange,
}: {
  value: string;
  correctAnswer: string;
  isCorrect?: boolean;
  submitted: boolean;
  onChange: (val: string) => void;
}) {
  let cls = '';
  if (submitted) cls = isCorrect ? 'correct' : 'incorrect';

  return (
    <input
      type="text"
      className={`smd-fillin-input${cls ? ` ${cls}` : ''}`}
      placeholder="Type your answer…"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={submitted}
    />
  );
}

// ── Matching ──────────────────────────────────────────────────────────────────

function MatchingInput({
  correctAnswer,
  pairs,
  selectedLeft,
  submitted,
  onSelectLeft,
  onSelectRight,
}: {
  correctAnswer: string;
  pairs: Record<string, string>;
  selectedLeft: string | null;
  submitted: boolean;
  onSelectLeft: (item: string) => void;
  onSelectRight: (item: string) => void;
}) {
  let correctMap: Record<string, string> = {};
  try { correctMap = JSON.parse(correctAnswer); } catch { /* ignore */ }

  const leftItems = Object.keys(correctMap);
  const rightItems = shuffle(Object.values(correctMap));

  function leftClass(item: string) {
    if (submitted) {
      return pairs[item] === correctMap[item] ? 'matched-correct' : 'matched-incorrect';
    }
    if (item === selectedLeft) return 'selected-left';
    if (pairs[item] !== undefined) return 'matched-correct';
    return '';
  }

  function rightClass(item: string) {
    if (submitted) {
      const matchedBy = Object.entries(pairs).find(([, v]) => v === item)?.[0];
      if (!matchedBy) return '';
      return pairs[matchedBy] === correctMap[matchedBy] ? 'matched-correct' : 'matched-incorrect';
    }
    if (Object.values(pairs).includes(item)) return 'matched-correct';
    return '';
  }

  return (
    <div className="smd-matching-container">
      <div>
        <div className="smd-matching-col-label">Term</div>
        {leftItems.map((item) => (
          <div
            key={item}
            className={`smd-match-item${leftClass(item) ? ` ${leftClass(item)}` : ''}${submitted ? ' disabled' : ''}`}
            onClick={() => onSelectLeft(item)}
          >
            {item}
          </div>
        ))}
      </div>
      <div>
        <div className="smd-matching-col-label">Definition</div>
        {rightItems.map((item) => (
          <div
            key={item}
            className={`smd-match-item${rightClass(item) ? ` ${rightClass(item)}` : ''}${submitted ? ' disabled' : ''}${selectedLeft && !Object.values(pairs).includes(item) ? ' hover-target' : ''}`}
            onClick={() => onSelectRight(item)}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
