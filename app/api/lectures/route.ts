import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LectureRow {
  internal_id: string;
  title: string;
  subtitle: string | null;
  course: string;
  color: string;
  icon: string;
  topics: unknown[];
  slide_count: number;
}

interface SettingsRow {
  display_order: number;
  visible: boolean;
  archived: boolean;
  group_id: string | null;
  tags: string[];
  course_override: string | null;
  color_override: string | null;
  custom_title: string | null;
}

interface JoinedRow extends LectureRow {
  user_lecture_settings: SettingsRow[] | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function buildSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
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
}

function applyOverrides(row: JoinedRow) {
  const settings: SettingsRow = row.user_lecture_settings?.[0] ?? {
    display_order: 9999,
    visible: true,
    archived: false,
    group_id: null,
    tags: [],
    course_override: null,
    color_override: null,
    custom_title: null,
  };

  return {
    internalId: row.internal_id,
    // User overrides take precedence over the immutable lecture values
    title: settings.custom_title ?? row.title,
    subtitle: row.subtitle,
    course: settings.course_override ?? row.course,
    color: settings.color_override ?? row.color,
    icon: row.icon,
    topics: row.topics,
    slideCount: row.slide_count,
    settings: {
      displayOrder: settings.display_order,
      visible: settings.visible,
      archived: settings.archived,
      groupId: settings.group_id,
      tags: settings.tags ?? [],
      courseOverride: settings.course_override,
      colorOverride: settings.color_override,
      customTitle: settings.custom_title,
    },
  };
}

// ---------------------------------------------------------------------------
// GET /api/lectures
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest) {
  const supabase = await buildSupabaseClient();

  // Auth check
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Fetch lectures joined with user-specific settings.
  // We left-join so that lectures without settings rows still appear
  // (new lectures before user has customised anything).
  const { data, error } = await supabase
    .from("lectures")
    .select(
      `
      internal_id,
      title,
      subtitle,
      course,
      color,
      icon,
      topics,
      slide_count,
      user_lecture_settings!left (
        display_order,
        visible,
        archived,
        group_id,
        tags,
        course_override,
        color_override,
        custom_title
      )
    `
    )
    .eq("user_lecture_settings.user_id", userId);

  if (error) {
    console.error("[GET /api/lectures] Supabase error:", error);
    return NextResponse.json(
      { error: "Failed to fetch lectures" },
      { status: 500 }
    );
  }

  const lectures = (data as JoinedRow[])
    .map(applyOverrides)
    // Sort by display_order ascending; lectures without a settings row
    // (display_order === 9999) sort to the bottom.
    .sort((a, b) => a.settings.displayOrder - b.settings.displayOrder);

  return NextResponse.json({ lectures });
}
