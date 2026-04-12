// app/api/lectures/tags/route.ts
// GET /api/lectures/tags
// Returns all unique tag strings across all of the authenticated user's lecture settings.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const cookieStore = await cookies();
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

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("user_lecture_settings")
    .select("tags")
    .eq("user_id", session.user.id);

  if (error) {
    console.error("[GET /api/lectures/tags] Supabase error:", error);
    return NextResponse.json(
      { error: "Failed to fetch tags" },
      { status: 500 }
    );
  }

  const tagSet = new Set<string>();
  for (const row of data ?? []) {
    if (Array.isArray(row.tags)) {
      row.tags.forEach((t: string) => tagSet.add(t));
    }
  }

  return NextResponse.json({ tags: Array.from(tagSet).sort() });
}
