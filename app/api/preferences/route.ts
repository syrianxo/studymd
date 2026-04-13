import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_THEMES = ["midnight", "pink", "forest"] as const;
type Theme = (typeof VALID_THEMES)[number];

// Default preferences returned when no row exists yet
const DEFAULT_PREFERENCES = {
  theme: "midnight" as Theme,
  settings: {} as Record<string, unknown>,
};

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

async function requireSession(supabase: Awaited<ReturnType<typeof buildSupabaseClient>>) {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session) return null;
  return session;
}

// ---------------------------------------------------------------------------
// GET /api/preferences
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest) {
  const supabase = await buildSupabaseClient();
  const session = await requireSession(supabase);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("user_preferences")
    .select("theme, settings")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (error) {
    console.error("[GET /api/preferences] Supabase error:", error);
    return NextResponse.json(
      { error: "Failed to fetch preferences" },
      { status: 500 }
    );
  }

  // If the user has no preferences row yet, return safe defaults
  const preferences = data ?? DEFAULT_PREFERENCES;

  return NextResponse.json({
    preferences: {
      theme: preferences.theme ?? DEFAULT_PREFERENCES.theme,
      settings: preferences.settings ?? DEFAULT_PREFERENCES.settings,
    },
  });
}

// ---------------------------------------------------------------------------
// PUT /api/preferences
// ---------------------------------------------------------------------------

interface PutBody {
  theme?: string;
  settings?: Record<string, unknown>;
}

export async function PUT(req: NextRequest) {
  const supabase = await buildSupabaseClient();
  const session = await requireSession(supabase);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse body
  let body: PutBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Must provide at least one updatable field
  if (body.theme === undefined && body.settings === undefined) {
    return NextResponse.json(
      { error: "Body must include at least one of: theme, settings" },
      { status: 400 }
    );
  }

  // Validate theme
  if (body.theme !== undefined) {
    if (!VALID_THEMES.includes(body.theme as Theme)) {
      return NextResponse.json(
        {
          error: `theme must be one of: ${VALID_THEMES.join(", ")}`,
        },
        { status: 400 }
      );
    }
  }

  // Validate settings — must be a plain object if provided
  if (body.settings !== undefined) {
    if (
      typeof body.settings !== "object" ||
      body.settings === null ||
      Array.isArray(body.settings)
    ) {
      return NextResponse.json(
        { error: "settings must be a plain JSON object" },
        { status: 400 }
      );
    }

    // Enforce a reasonable size limit to prevent storing arbitrary blobs
    const settingsJson = JSON.stringify(body.settings);
    if (settingsJson.length > 8192) {
      return NextResponse.json(
        { error: "settings object is too large (max 8 KB)" },
        { status: 400 }
      );
    }
  }

  // Build the update payload — only include fields that were sent
  const updatePayload: Record<string, unknown> = {
    user_id: session.user.id,
  };
  if (body.theme !== undefined) updatePayload.theme = body.theme;
  if (body.settings !== undefined) updatePayload.settings = body.settings;

  // Upsert — creates the row if it doesn't exist, otherwise updates it
  const { data, error } = await supabase
    .from("user_preferences")
    .upsert(updatePayload, { onConflict: "user_id" })
    .select("theme, settings")
    .single();

  if (error) {
    console.error("[PUT /api/preferences] upsert error:", error);
    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    preferences: {
      theme: data.theme,
      settings: data.settings ?? {},
    },
  });
}
