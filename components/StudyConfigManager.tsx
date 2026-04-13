'use client';

// components/StudyConfigManager.tsx
//
// Sits inside Dashboard.tsx. Manages which config modal is open and
// bridges LectureCard → FlashcardConfigModal/ExamConfigModal → study views.
//
// USAGE inside Dashboard.tsx:
//
//   import { StudyConfigManager, useStudyConfig } from '@/components/StudyConfigManager';
//
//   // Inside the dashboard component:
//   const studyConfig = useStudyConfig();
//
//   // On each LectureCard:
//   <LectureCard
//     ...
//     onFlashcards={() => studyConfig.openFlashcards(lecture)}
//     onExam={() => studyConfig.openExam(lecture)}
//   />
//
//   // Below the grid:
//   <StudyConfigManager
//     {...studyConfig}
//     // Called after the user confirms config — navigate to study view:
//     onStartFlashcards={(lecture, config) => {
//       router.push(`/app/study/flashcards/${lecture.internal_id}?count=${config.count}&topics=${config.topics.join(',')}&order=${config.order}`);
//       // OR: call your existing state-based navigation handler
//     }}
//     onStartExam={(lecture, config) => {
//       router.push(`/app/study/exam/${lecture.internal_id}?count=${config.count}&topics=${config.topics.join(',')}&types=${config.types.join(',')}`);
//     }}
//   />

import { useState, useCallback } from 'react';
import FlashcardConfigModal, { type FlashcardConfig } from './study/FlashcardConfigModal';
import ExamConfigModal, { type ExamConfig } from './study/ExamConfigModal';
import type { LectureWithSettings } from '@/types';
import type { FlashCard } from './study/FlashcardView';
import type { ExamQuestion } from './study/ExamView';

// ── Types ────────────────────────────────────────────────────────────────────

type ModalMode = 'flashcards' | 'exam' | null;

interface StudyConfigState {
  mode: ModalMode;
  lecture: LectureWithSettings | null;
  openFlashcards: (lecture: LectureWithSettings) => void;
  openExam: (lecture: LectureWithSettings) => void;
  close: () => void;
}

interface StudyConfigManagerProps extends StudyConfigState {
  /** Called when user confirms flashcard config. */
  onStartFlashcards: (lecture: LectureWithSettings, config: FlashcardConfig) => void;
  /** Called when user confirms exam config. */
  onStartExam: (lecture: LectureWithSettings, config: ExamConfig) => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useStudyConfig — manages modal open/close state.
 * Call in your Dashboard component and spread into <StudyConfigManager />.
 */
export function useStudyConfig(): StudyConfigState {
  const [mode, setMode] = useState<ModalMode>(null);
  const [lecture, setLecture] = useState<LectureWithSettings | null>(null);

  const openFlashcards = useCallback((l: LectureWithSettings) => {
    setLecture(l);
    setMode('flashcards');
  }, []);

  const openExam = useCallback((l: LectureWithSettings) => {
    setLecture(l);
    setMode('exam');
  }, []);

  const close = useCallback(() => {
    setMode(null);
    setLecture(null);
  }, []);

  return { mode, lecture, openFlashcards, openExam, close };
}

// ── Manager component ─────────────────────────────────────────────────────────

/**
 * StudyConfigManager — renders the appropriate config modal and routes
 * the confirmed config to the start handler.
 *
 * Place this once inside Dashboard.tsx (outside the card grid).
 */
export function StudyConfigManager({
  mode, lecture,
  close,
  onStartFlashcards,
  onStartExam,
}: StudyConfigManagerProps) {
  if (!lecture || !mode) return null;

  // Extract cards and questions from json_data
  const jsonData = lecture.json_data as {
    flashcards?: FlashCard[];
    questions?: ExamQuestion[];      // actual DB key
    exam_questions?: ExamQuestion[]; // normalised key set by buildLectureWithSettings
  } | null;

  const allCards: FlashCard[] = jsonData?.flashcards ?? [];
  const allQuestions: ExamQuestion[] =
    jsonData?.exam_questions ?? jsonData?.questions ?? [];

  if (mode === 'flashcards') {
    if (allCards.length === 0) {
      // Graceful fallback — no cards in this lecture
      return null;
    }
    return (
      <FlashcardConfigModal
        lectureTitle={lecture.display_title}
        lectureSubtitle={lecture.subtitle ?? undefined}
        lectureIcon={lecture.icon ?? '📇'}
        accentColor={lecture.display_color}
        allCards={allCards}
        onStart={(config) => {
          close();
          onStartFlashcards(lecture, config);
        }}
        onClose={close}
      />
    );
  }

  if (mode === 'exam') {
    if (allQuestions.length === 0) {
      return null;
    }
    return (
      <ExamConfigModal
        lectureTitle={lecture.display_title}
        lectureSubtitle={lecture.subtitle ?? undefined}
        lectureIcon={lecture.icon ?? '📝'}
        accentColor={lecture.display_color}
        allQuestions={allQuestions}
        onStart={(config) => {
          close();
          onStartExam(lecture, config);
        }}
        onClose={close}
      />
    );
  }

  return null;
}
