import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** All fields are optional — only provided keys are written. */
interface SettingsUpdates {
  displayOrder?: number;
  visible?: boolean;
  archived?: boolean;
  groupId?: string | null;
  tags?: string[];
  courseOverride?: string | null;
  colorOverride?: string | null;
  customTitle?: string | null;
}

interface PutBody {
  internalId: string;
  updates: SettingsUpdates;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_COURSES = [
  "Physical Diagnosis I",
  "Anatomy & Physiology",
  "Laboratory Diagnosis",
];

function validateUpdates(updates: SettingsUpdates): string | null {
  if (updates.displayOrder !== undefined) {
    if (
      typeof updates.displayOrder !== "number" ||
      !Number.isInteger(updates.displayOrder) ||
      updates.displayOrder < 0
    ) {
      return "displayOrder must be a non-negative integer";
    }
  }
  if (
    updates.visible !== undefined &&
    typeof updates.visible !== "boolean"
  ) {
    return "visible must be a boolean";
  }
  if (
    updates.archived !== undefined &&
    typeof updates.archived !== "boolean"
  ) {
    return "archived must be a boolean";
  }
  if (
    updates.tags !== undefined &&
    (!Array.isArray(updates.tags) ||
      updates.tags.some((t) => typeof t !== "string"))
  ) {
    return "tags must be an array of strings";
  }
  if (
    updates.courseOverride !== undefined &&
    updates.courseOverride !== null &&
    !VALID_COURSES.includes(updates.courseOverride)
  ) {
    return `courseOverride must be one of: ${VALID_COURSES.join(", ")}`;
  }
  if (
    updates.colorOverride !== undefined &&
    updates.colorOverride !== null &&
    !/^#[0-9A-Fa-f]{6}$/.test(updates.colorOverride)
  ) {
    return "colorOverride must be a hex color (e.g. #5b8dee) or null";
  }
  if (
    updates.customTitle !== undefined &&
    updates.customTitle !== null &&
    (typeof updates.customTitle !== "string" ||
      updates.customTitle.trim().length === 0)
  ) {
    return "customTitle must be a non-empty string or null";
  }
  return null;
}

// Map camelCase body fields → snake_case column names
function toColumnMap(updates: SettingsUpdates): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  if (updates.displayOrder !== undefined) map.display_order = updates.displayOrder;
  if (updates.visible !== undefined) map.visible = updates.visible;
  if (updates.archived !== undefined) map.archived = updates.archived;
  if ("groupId" in updates) map.group_id = updates.groupId;
  if (updates.tags !== undefined) map.tags = updates.tags;
  if ("courseOverride" in updates) map.course_override = updates.courseOverride;
  if ("colorOverride" in updates) map.color_override = updates.colorOverride;
  if ("customTitle" in updates) map.custom_title = updates.customTitle;
  return map;
}

// ---------------------------------------------------------------------------
// PUT /api/lectures/settings
// ---------------------------------------------------------------------------

export async function PUT(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  // Auth check
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse body
  let body: PutBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { internalId, updates } = body;

  if (!internalId || typeof internalId !== "string") {
    return NextResponse.json(
      { error: "internalId is required and must be a string" },
      { status: 400 }
    );
  }

  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    return NextResponse.json(
      { error: "updates must be an object" },
      { status: 400 }
    );
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "updates must contain at least one field" },
      { status: 400 }
    );
  }

  const validationError = validateUpdates(updates);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  // Confirm the lecture exists before upserting settings
  const { data: lectureExists, error: lectureCheckError } = await supabase
    .from("lectures")
    .select("internal_id")
    .eq("internal_id", internalId)
    .maybeSingle();

  if (lectureCheckError) {
    console.error("[PUT /api/lectures/settings] lecture check error:", lectureCheckError);
    return NextResponse.json(
      { error: "Failed to verify lecture" },
      { status: 500 }
    );
  }

  if (!lectureExists) {
    return NextResponse.json({ error: "Lecture not found" }, { status: 404 });
  }

  // Upsert — RLS policy on user_lecture_settings ensures user_id = auth.uid()
  const columns = toColumnMap(updates);

  const { data, error } = await supabase
    .from("user_lecture_settings")
    .upsert(
      {
        user_id: session.user.id,
        internal_id: internalId,
        ...columns,
      },
      {
        onConflict: "user_id,internal_id",
        ignoreDuplicates: false,
      }
    )
    .select()
    .single();

  if (error) {
    console.error("[PUT /api/lectures/settings] upsert error:", error);
    return NextResponse.json(
      { error: "Failed to update lecture settings" },
      { status: 500 }
    );
  }

  // Return camelCase response
  return NextResponse.json({
    settings: {
      internalId: data.internal_id,
      displayOrder: data.display_order,
      visible: data.visible,
      archived: data.archived,
      groupId: data.group_id,
      tags: data.tags ?? [],
      courseOverride: data.course_override,
      colorOverride: data.color_override,
      customTitle: data.custom_title,
    },
  });
}
