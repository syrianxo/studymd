// app/app/study/exam/[id]/page.tsx
//
// Reads URL search params set by ExamConfigModal:
//   ?count=15&topics=Topic+A,Topic+B&types=mcq,tf,matching,fillin

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import ExamStudyClient from './ExamStudyClient';
import type { QuestionType } from '@/components/study/ExamView';

const VALID_TYPES = new Set<QuestionType>(['mcq', 'tf', 'matching', 'fillin']);

interface PageProps {
  params: { id: string };
  searchParams: {
    count?: string;
    topics?: string;   // comma-separated
    types?: string;    // comma-separated: mcq,tf,matching,fillin
  };
}

export default async function ExamStudyPage({ params, searchParams }: PageProps) {
  const supabase = createServerComponentClient({ cookies });

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const { data: lecture, error } = await supabase
    .from('lectures')
    .select('internal_id, title, subtitle, json_data')
    .eq('internal_id', params.id)
    .single();

  if (error || !lecture) redirect('/app');

  const { data: progress } = await supabase
    .from('user_progress')
    .select('exam_progress')
    .eq('user_id', session.user.id)
    .eq('internal_id', params.id)
    .single();

  const jsonData = lecture.json_data as { exam_questions?: unknown[] } | null;
  const allQuestions = (jsonData?.exam_questions ?? []) as Array<{
    id: string; type: string; question: string; topic: string;
    options?: string[]; correct_answer: string; explanation?: string;
  }>;

  // Parse config from URL
  const requestedCount = searchParams.count ? parseInt(searchParams.count, 10) : null;

  const requestedTopics = searchParams.topics
    ? searchParams.topics.split(',').map((t) => decodeURIComponent(t.trim())).filter(Boolean)
    : null;

  const requestedTypes: QuestionType[] = searchParams.types
    ? (searchParams.types
        .split(',')
        .map((t) => t.trim() as QuestionType)
        .filter((t) => VALID_TYPES.has(t)))
    : ['mcq', 'tf', 'matching', 'fillin'];

  // Filter by topics if specified
  let filteredQuestions = requestedTopics && requestedTopics.length > 0
    ? allQuestions.filter((q) => requestedTopics.includes(q.topic))
    : allQuestions;

  // Filter by question types
  filteredQuestions = filteredQuestions.filter((q) =>
    requestedTypes.includes(q.type as QuestionType)
  );

  // Shuffle and limit to requested count
  filteredQuestions = [...filteredQuestions].sort(() => Math.random() - 0.5);
  if (requestedCount && requestedCount > 0 && requestedCount < filteredQuestions.length) {
    filteredQuestions = filteredQuestions.slice(0, requestedCount);
  }

  const examProgress = progress?.exam_progress as {
    sessions?: Array<{ score: number; correct: number; total: number; date: string }>;
  } | null;

  return (
    <ExamStudyClient
      lectureId={lecture.internal_id}
      lectureTitle={lecture.title}
      questions={filteredQuestions as Parameters<typeof ExamStudyClient>[0]['questions']}
      examProgress={examProgress}
    />
  );
}
