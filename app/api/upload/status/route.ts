/**
 * GET /api/upload/status?jobId=X
 *
 * Polls the status of a lecture processing job.
 * The client calls this every 5 seconds after POSTing to /api/upload.
 *
 * Workstream 1 will implement the full handler:
 *   - Validate auth
 *   - SELECT status, error_message, internal_id FROM processing_jobs
 *     WHERE id = jobId AND user_id = auth.uid()
 *   - Return status object
 *
 * Response shape:
 * {
 *   jobId: string
 *   status: "pending" | "processing" | "done" | "error"
 *   internalId?: string        // present when status === "done"
 *   errorMessage?: string      // present when status === "error"
 *   progress?: {               // optional progress hints
 *     step: "uploading" | "converting" | "generating" | "saving"
 *     pct: number              // 0–100
 *   }
 * }
 */
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  // TODO (Workstream 1): query processing_jobs table
  return NextResponse.json(
    { error: "Not yet implemented — see Workstream 1", jobId },
    { status: 501 }
  );
}
