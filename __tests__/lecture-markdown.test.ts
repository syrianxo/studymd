import { describe, it, expect } from 'vitest';
import { buildLectureMarkdown } from '../lib/lecture-markdown';
import type { LectureJSON } from '../lib/validate-lecture';

const sample: LectureJSON = {
  lecture_id: 'L1',
  course: 'Cardio',
  title: 'Aortic Dissection',
  summary: 'A tear in the aortic intima that allows blood to dissect the media.',
  topics: ['Pathophysiology', 'Management'],
  flashcards: [
    {
      id: 'F001', topic: 'Pathophysiology',
      front: 'Classic chief complaint in aortic dissection?',
      back: 'Sudden tearing chest pain radiating to the back.',
      tags: ['cardio'], difficulty: 'easy', slide_number: 2,
    },
  ],
  questions: [
    {
      id: 'Q001', topic: 'Management', type: 'mcq',
      stem: 'First-line IV therapy for Stanford type B?',
      options: ['Esmolol', 'Nitroprusside alone', 'Heparin', 'Aspirin'],
      answer: 'A',
      explanation: 'Beta blockade first to reduce shear stress.',
      difficulty: 'medium', slide_number: 6,
    },
  ],
};

describe('buildLectureMarkdown', () => {
  it('includes title, summary, flashcards and questions', () => {
    const md = buildLectureMarkdown({ lecture: sample });
    expect(md).toContain('# Aortic Dissection');
    expect(md).toContain('## Summary');
    expect(md).toContain('Sudden tearing chest pain');
    expect(md).toContain('**A.** Esmolol');
    expect(md).toContain('**Answer.** A — Esmolol');
  });

  it('includes slide-level annotations and student notes when provided', () => {
    const md = buildLectureMarkdown({
      lecture: sample,
      annotations: [{ slide_number: 2, body: 'Clinical note body.' }],
      notes: [{ slide_number: 2, body: 'My study note.' }],
    });
    expect(md).toContain('### Slide 2');
    expect(md).toContain('**Clinical note.** Clinical note body.');
    expect(md).toContain('**My note.** My study note.');
  });
});
