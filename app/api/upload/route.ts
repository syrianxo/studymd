/**
 * POST /api/upload
 *
 * Lecture upload entry point. Accepts multipart/form-data with:
 *   - file:   PDF or PPTX (max 50MB, see API_LIMITS)
 *   - course: one of the three valid course strings
 *   - title:  optional override title
 *
 * Workstream 1 will implement the full handler:
 *   1. Validate auth (must be logged in)
 *   2. Validate file type and size against API_LIMITS
 *   3. Check daily API limits (API_LIMITS.MAX_DAILY_CALLS)
 *   4. Save file to Supabase Storage: uploads/{timestamp}_{filename}
 *   5. Create a processing_jobs row with status "pending"
 *   6. Trigger processing (Supabase Edge Function or background job)
 *   7. Return { jobId, estimatedCost, estimatedTokens }
 *
 * The client then polls GET /api/upload/status?jobId=X every 5 seconds.
 *
 * Note on Vercel 60s timeout:
 *   The actual Claude API call and slide conversion happen in a
 *   background job (Supabase Edge Function, 150s timeout on free tier),
 *   not in this route. This route only queues the job and returns fast.
 */
import { NextResponse } from "next/server";
import { API_LIMITS } from "@/lib/api-limits";

export async function POST(request: Request) {
  // Validate content type
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Expected multipart/form-data" },
      { status: 400 }
    );
  }

  // TODO (Workstream 1): full implementation
  // For now, surface the configured limits so the UI can show them
  return NextResponse.json(
    {
      error: "Not yet implemented — see Workstream 1",
      limits: {
        maxFileSizeBytes: API_LIMITS.MAX_FILE_SIZE_BYTES,
        allowedMimeTypes: API_LIMITS.ALLOWED_MIME_TYPES,
        maxDailyCalls: API_LIMITS.MAX_DAILY_CALLS,
      },
    },
    { status: 501 }
  );
}
