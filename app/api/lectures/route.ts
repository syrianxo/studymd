/**
 * GET  /api/lectures  — returns all lectures with user display settings,
 *                       ordered by display_order
 * POST /api/lectures  — creates a new lecture record (called internally
 *                       after processing completes, not directly by UI)
 *
 * Workstream 5 will implement GET fully:
 *   - Validate auth
 *   - JOIN lectures + user_lecture_settings WHERE user_id = auth.uid()
 *   - Order by display_order ASC
 *   - Return merged lecture objects
 *
 * Workstream 1 will implement POST (called from /api/generate after
 * Claude processing succeeds):
 *   - Insert into lectures table
 *   - Insert default row into user_lecture_settings
 */
import { NextResponse } from "next/server";

export async function GET() {
  // TODO (Workstream 5): implement lecture list with user settings
  return NextResponse.json(
    { error: "Not yet implemented — see Workstream 5" },
    { status: 501 }
  );
}

export async function POST() {
  // TODO (Workstream 1): implement lecture creation post-processing
  return NextResponse.json(
    { error: "Not yet implemented — see Workstream 1" },
    { status: 501 }
  );
}
