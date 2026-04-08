/**
 * PUT /api/lectures/settings
 *
 * Updates display settings for one lecture (order, visibility,
 * tags, group, color override, course override, custom title).
 *
 * Workstream 5 will implement the full handler:
 *   - Validate auth
 *   - Parse { internalId, settings } from body
 *   - Upsert into user_lecture_settings
 *   - Return { ok: true }
 *
 * Request body shape:
 * {
 *   internalId: string
 *   settings: Partial<{
 *     displayOrder: number
 *     visible: boolean
 *     archived: boolean
 *     groupId: string | null
 *     tags: string[]
 *     courseOverride: string | null
 *     colorOverride: string | null
 *     customTitle: string | null
 *   }>
 * }
 */
import { NextResponse } from "next/server";

export async function PUT() {
  // TODO (Workstream 5): implement settings update
  return NextResponse.json(
    { error: "Not yet implemented — see Workstream 5" },
    { status: 501 }
  );
}
