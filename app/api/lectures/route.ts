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
  // Per-theme color map (JSONB). lectures.color was dropped (ADR-023);
  // theme_colors replaced it.
  theme_colors: Record<string, string> | null;
  icon: string;
  topics: unknown[];
  slide_count: number;
  json_data: { flashcards?: unknown[]; questions?: unknown[] } | null;
}

interface SettingsRow {
  display_order: number;
  visible: boolean;
  archived: boolean;
  group_id: string | null;
  tags: string[];
  course_override: string | null;
  // user_lecture_settings.color_override is JSONB (per-theme map). The
  // legacy text variant is preserved separately as color_override_legacy.
  color_override: Record<string, string> | null;
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

  // Back-compat: legacy consumers (TodaysPlanWidget, plans/page.tsx) read a
  // single `color` string. Resolve it from the per-theme maps using a default
  // theme so they keep working unchanged. Theme-aware consumers can use
  // `themeColors` + `colorOverride` directly.
  const DEFAULT_THEME = 'midnight';
  const resolvedColor =
    settings.color_override?.[DEFAULT_THEME] ??
    row.theme_colors?.[DEFAULT_THEME] ??
    null;

  return {
    internalId: row.internal_id,
    title: settings.custom_title ?? row.title,
    subtitle: row.subtitle,
    course: settings.course_override ?? row.course,
    color: resolvedColor,
    // Per-theme JSONB maps; theme-aware consumers resolve themselves.
    themeColors: row.theme_colors,
    colorOverride: settings.color_override,
    icon: row.icon,
    topics: row.topics,
    slideCount: row.slide_count,
    // Lightweight card counts — used by the Plans page lecture selector.
    // We avoid sending the full json_data payload to the client.
    flashcardCount: row.json_data?.flashcards?.length ?? 0,
    questionCount:  row.json_data?.questions?.length  ?? 0,
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

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const { data, error } = await supabase
    .from("lectures")
    .select(
      `
      internal_id,
      title,
      subtitle,
      course,
      theme_colors,
      icon,
      topics,
      slide_count,
      json_data,
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
    .sort((a, b) => a.settings.displayOrder - b.settings.displayOrder);

  return NextResponse.json({ lectures });
}
