/**
 * POST /api/progress/save
 *
 * Saves flashcard or exam progress for the authenticated user.
 *
 * Workstream 2 will implement the full handler:
 *   - Validate auth session (Supabase JWT from cookie)
 *   - Parse { internalId, type, data } from request body
 *   - Upsert into user_progress table
 *   - Return { ok: true, updatedAt }
 */
import { NextResponse } from "next/server";

export async function POST() {
  // TODO (Workstream 2): implement progress save
  return NextResponse.json(
    { error: "Not yet implemented — see Workstream 2" },
    { status: 501 }
  );
}
