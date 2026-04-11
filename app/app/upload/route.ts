import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkLimits, estimateCost, estimateTokens, TOKEN_PREFLIGHT_LIMIT } from '@/lib/api-limits';

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

// ─── Auth Helper ───────────────────────────────────────────────────────────
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
    // 1. Auth
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
    }

    // 2. Parse multipart form
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Invalid multipart form data.' }, { status: 400 });
    }

    const file = formData.get('file') as File | null;
    const course = formData.get('course') as string | null;
    const titleOverride = formData.get('title') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }
    if (!course) {
      return NextResponse.json({ error: 'Course is required.' }, { status: 400 });
    }

    // 3. Validate file type
    const ext = getFileExtension(file.name);
    const mimeOk = ALLOWED_MIME_TYPES.has(file.type);
    const extOk = ALLOWED_EXTENSIONS.has(ext);

    if (!mimeOk && !extOk) {
      return NextResponse.json(
        { error: `Unsupported file type "${file.type}". Only PDF and PPTX files are accepted.` },
        { status: 415 }
      );
    }

    // 4. Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      return NextResponse.json(
        { error: `File too large (${sizeMB} MB). Maximum allowed size is 50 MB.` },
        { status: 413 }
      );
    }

    // 5. Check daily / monthly limits
    const limitsCheck = await checkLimits(user.id);
    if (!limitsCheck.allowed) {
      return NextResponse.json(
        { error: limitsCheck.reason ?? 'Usage limit reached.' },
        { status: 429 }
      );
    }

    // 6. Token pre-flight — estimate from file size, warn if huge
    const estimatedTokens = estimateTokens(file.size / 4); // rough: 1 char per 4 bytes → 1 token per 4 chars
    const tokenWarning =
      estimatedTokens > TOKEN_PREFLIGHT_LIMIT
        ? `This file may contain ~${(estimatedTokens / 1000).toFixed(0)}K tokens, which exceeds the 200K recommended limit. Consider splitting it into smaller sections for better results.`
        : undefined;

    // 7. Upload to Supabase Storage
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
      return NextResponse.json(
        { error: 'Failed to store file. Please try again.' },
        { status: 500 }
      );
    }

    // 8. Create processing_jobs row
    const estimatedCost = estimateCost(file.size);
    const lectureTitle = titleOverride?.trim() || file.name.replace(/\.[^.]+$/, '');

    const { data: job, error: jobError } = await supabase
      .from('processing_jobs')
      .insert({
        user_id: user.id,
        storage_path: storagePath,
        original_filename: file.name,
        file_size_bytes: file.size,
        file_type: ext.slice(1), // 'pdf' or 'pptx'
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
      // Clean up uploaded file
      await supabase.storage.from('uploads').remove([storagePath]);
      return NextResponse.json(
        { error: 'Failed to create processing job. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      jobId: job.id,
      estimatedCost,
      estimatedTokens,
      tokenWarning,
      storagePath,
    });
  } catch (err) {
    console.error('Upload route error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
