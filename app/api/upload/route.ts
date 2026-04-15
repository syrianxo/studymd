import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkLimits, estimateCost, estimateTokens, TOKEN_PREFLIGHT_LIMIT } from '@/lib/api-limits';

// ─── Route config ──────────────────────────────────────────────────────────
// Disable Next.js body-size limit (default 1 MB) so large PDFs/PPTX can
// stream through. Vercel Hobby allows up to 4.5 MB per request body;
// for larger files the client should upload directly to Supabase Storage
// and pass the storage path instead (future workstream).
export const maxDuration = 60; // seconds — Vercel Hobby max
export const dynamic = 'force-dynamic';

// App Router body-size override (replaces pages/api bodyParser config)
export const runtime = 'nodejs'; // ensure streaming body parsing

// ─── Config ────────────────────────────────────────────────────────────────
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
]);
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.pptx', '.ppt']);

function getFileExtension(filename: string): string {
  return filename.slice(filename.lastIndexOf('.')).toLowerCase();
}

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase environment variables are not configured.');
  return createClient(url, key);
}

async function getUserFromRequest(request: NextRequest): Promise<{ id: string; email: string } | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? '' };
}

// ─── POST /api/upload ──────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Invalid multipart form data.' }, { status: 400 });
    }

    const file = formData.get('file') as File | null;
    const course = formData.get('course') as string | null;
    const titleOverride = formData.get('title') as string | null;

    if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    if (!course) return NextResponse.json({ error: 'Course is required.' }, { status: 400 });

    const ext = getFileExtension(file.name);
    if (!ALLOWED_MIME_TYPES.has(file.type) && !ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: `Unsupported file type. Only PDF and PPTX files are accepted.` },
        { status: 415 }
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 50 MB.` },
        { status: 413 }
      );
    }

    const limitsCheck = await checkLimits(user.id);
    if (!limitsCheck.allowed) {
      return NextResponse.json({ error: limitsCheck.reason ?? 'Usage limit reached.' }, { status: 429 });
    }

    const estimatedTokens = estimateTokens(file.size / 4);
    const tokenWarning = estimatedTokens > TOKEN_PREFLIGHT_LIMIT
      ? `This file may contain ~${(estimatedTokens / 1000).toFixed(0)}K tokens, exceeding the 200K recommended limit. Consider splitting it.`
      : undefined;

    const supabase = getSupabaseClient();
    const timestamp = Date.now();
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${user.id}/${timestamp}_${safeFilename}`;

    const fileBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(storagePath, fileBuffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json({ error: 'Failed to store file. Please try again.' }, { status: 500 });
    }

    const estimatedCost = estimateCost(file.size);
    const lectureTitle = titleOverride?.trim() || file.name.replace(/\.[^.]+$/, '');

    const { data: job, error: jobError } = await supabase
      .from('processing_jobs')
      .insert({
        user_id: user.id,
        storage_path: storagePath,
        original_filename: file.name,
        file_size_bytes: file.size,
        file_type: ext.slice(1),
        course,
        title: lectureTitle,
        status: 'pending',
        estimated_cost_usd: estimatedCost,
        estimated_tokens: estimatedTokens,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (jobError || !job) {
      console.error('Job creation error:', jobError);
      await supabase.storage.from('uploads').remove([storagePath]);
      return NextResponse.json({ error: 'Failed to create processing job. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ jobId: job.id, estimatedCost, estimatedTokens, tokenWarning });
  } catch (err) {
    console.error('Upload route error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
