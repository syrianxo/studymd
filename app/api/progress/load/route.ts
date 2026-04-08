/**
 * GET /api/progress/load
 *
 * Loads all progress rows for the authenticated user.
 *
 * Workstream 2 will implement the full handler:
 *   - Validate auth session
 *   - SELECT * FROM user_progress WHERE user_id = auth.uid()
 *   - Return { progress: [...] }
 *
 * Response shape:
 * {
 *   progress: Array<{
 *     internalId: string
 *     flashcardProgress: Record<string, unknown>
 *     examProgress: Record<string, unknown>
 *     lastStudied: string | null
 *     updatedAt: string
 *   }>
 * }
 */
import { NextResponse } from "next/server";

export async function GET() {
  // TODO (Workstream 2): implement progress load
  return NextResponse.json(
    { error: "Not yet implemented — see Workstream 2" },
    { status: 501 }
  );
}
