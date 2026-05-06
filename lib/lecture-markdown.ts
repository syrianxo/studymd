// lib/lecture-markdown.ts
// Converts a stored lecture (json_data plus optional annotations and student notes)
// into a single Markdown document suitable for offline review or docx conversion.

import type { LectureJSON, LectureFlashcard, LectureQuestion } from '@/lib/validate-lecture';

export interface AnnotationRow {
  slide_number: number;
  body: string;
}

export interface NoteRow {
  slide_number: number;
  body: string;
}

export interface BuildMarkdownInput {
  lecture: LectureJSON;
  annotations?: AnnotationRow[];
  notes?: NoteRow[];
}

function letterToIndex(letter: string): number {
  return { A: 0, B: 1, C: 2, D: 3 }[letter.toUpperCase() as 'A' | 'B' | 'C' | 'D'] ?? -1;
}

function flashcardsByTopic(flashcards: LectureFlashcard[]): Map<string, LectureFlashcard[]> {
  const m = new Map<string, LectureFlashcard[]>();
  for (const fc of flashcards) {
    const list = m.get(fc.topic) ?? [];
    list.push(fc);
    m.set(fc.topic, list);
  }
  return m;
}

function questionsByTopic(questions: LectureQuestion[]): Map<string, LectureQuestion[]> {
  const m = new Map<string, LectureQuestion[]>();
  for (const q of questions) {
    const list = m.get(q.topic) ?? [];
    list.push(q);
    m.set(q.topic, list);
  }
  return m;
}

export function buildLectureMarkdown({ lecture, annotations = [], notes = [] }: BuildMarkdownInput): string {
  const out: string[] = [];

  out.push(`# ${lecture.title}`);
  out.push('');
  out.push(`_${lecture.course}_`);
  out.push('');

  if (lecture.summary) {
    out.push('## Summary');
    out.push('');
    out.push(lecture.summary);
    out.push('');
  }

  if (lecture.topics?.length) {
    out.push('## Topics');
    out.push('');
    for (const t of lecture.topics) out.push(`- ${t}`);
    out.push('');
  }

  // ── Slide-by-slide clinical notes + student notes ──
  if (annotations.length > 0 || notes.length > 0) {
    const bySlide = new Map<number, { ann?: string; note?: string }>();
    for (const a of annotations) {
      const prev = bySlide.get(a.slide_number) ?? {};
      bySlide.set(a.slide_number, { ...prev, ann: a.body });
    }
    for (const n of notes) {
      const prev = bySlide.get(n.slide_number) ?? {};
      bySlide.set(n.slide_number, { ...prev, note: n.body });
    }

    const slideNums = Array.from(bySlide.keys()).sort((a, b) => a - b);
    if (slideNums.length) {
      out.push('## Slide Notes');
      out.push('');
      for (const num of slideNums) {
        const entry = bySlide.get(num)!;
        out.push(`### Slide ${num}`);
        out.push('');
        if (entry.ann) {
          out.push('**Clinical note.** ' + entry.ann.trim());
          out.push('');
        }
        if (entry.note) {
          out.push('**My note.** ' + entry.note.trim());
          out.push('');
        }
      }
    }
  }

  // ── Flashcards grouped by topic ──
  const fcByTopic = flashcardsByTopic(lecture.flashcards ?? []);
  if (fcByTopic.size > 0) {
    out.push('## Flashcards');
    out.push('');
    for (const topic of lecture.topics ?? []) {
      const cards = fcByTopic.get(topic);
      if (!cards?.length) continue;
      out.push(`### ${topic}`);
      out.push('');
      for (const fc of cards) {
        out.push(`**Q (slide ${fc.slide_number}).** ${fc.front}`);
        out.push('');
        out.push(`A. ${fc.back}`);
        if (fc.tags?.length) {
          out.push('');
          out.push(`_Tags: ${fc.tags.join(', ')} · difficulty: ${fc.difficulty}_`);
        }
        out.push('');
      }
    }
  }

  // ── Practice questions grouped by topic ──
  const qByTopic = questionsByTopic(lecture.questions ?? []);
  if (qByTopic.size > 0) {
    out.push('## Practice Questions');
    out.push('');
    for (const topic of lecture.topics ?? []) {
      const qs = qByTopic.get(topic);
      if (!qs?.length) continue;
      out.push(`### ${topic}`);
      out.push('');
      for (const q of qs) {
        out.push(`**${q.id} (slide ${q.slide_number}, ${q.type}).** ${q.stem}`);
        out.push('');
        if ((q.type === 'mcq' || q.type === 'clinical_vignette') && q.options?.length) {
          const letters = ['A', 'B', 'C', 'D'];
          q.options.forEach((opt, i) => out.push(`- **${letters[i]}.** ${opt}`));
          const idx = letterToIndex(q.answer);
          out.push('');
          out.push(`**Answer.** ${q.answer}${idx >= 0 ? ` — ${q.options[idx] ?? ''}` : ''}`);
        } else {
          out.push(`**Answer.** ${q.answer}`);
        }
        out.push('');
        out.push(`**Explanation.** ${q.explanation}`);
        out.push('');
      }
    }
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
