import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createServerComponentClient, createServiceClient } from '@/lib/supabase-server';

export const metadata: Metadata = {
  title: 'StudyMD — Lecture Mastery Platform',
  description: 'Adaptive flashcards and practice exams for PA school.',
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') ?? '';

  // The onboarding page must render even when the user has no profile yet.
  if (pathname.startsWith('/app/onboarding')) {
    return <>{children}</>;
  }

  const supabase = await createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Unauthenticated requests are already caught by proxy.ts — fall through.
  if (!user) {
    return <>{children}</>;
  }

  const service = createServiceClient();
  const { data: profile } = await service
    .from('user_profiles')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile) {
    redirect('/app/onboarding');
  }

  return <>{children}</>;
}
