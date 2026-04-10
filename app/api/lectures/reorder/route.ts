import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrderItem {
  internalId: string;
  displayOrder: number;
}

interface PutBody {
  order: OrderItem[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateOrder(order: unknown): string | null {
  if (!Array.isArray(order)) return "order must be an array";
  if (order.length === 0) return "order must not be empty";
  if (order.length > 500) return "order must not exceed 500 items";

  for (let i = 0; i < order.length; i++) {
    const item = order[i];
    if (typeof item !== "object" || item === null) {
      return `order[${i}] must be an object`;
    }
    if (
      typeof (item as OrderItem).internalId !== "string" ||
      (item as OrderItem).internalId.trim() === ""
    ) {
      return `order[${i}].internalId must be a non-empty string`;
    }
    const d = (item as OrderItem).displayOrder;
    if (typeof d !== "number" || !Number.isInteger(d) || d < 0) {
      return `order[${i}].displayOrder must be a non-negative integer`;
    }
  }

  // No duplicate internalIds
  const ids = (order as OrderItem[]).map((o) => o.internalId);
  if (new Set(ids).size !== ids.length) {
    return "order contains duplicate internalId values";
  }

  return null;
}

// ---------------------------------------------------------------------------
// PUT /api/lectures/reorder
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

  const validationError = validateOrder(body?.order);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const userId = session.user.id;
  const order = body.order as OrderItem[];

  // Build upsert rows — one per lecture.
  // We only set user_id, internal_id, and display_order.
  // The upsert with onConflict preserves all other settings columns.
  const rows = order.map(({ internalId, displayOrder }) => ({
    user_id: userId,
    internal_id: internalId,
    display_order: displayOrder,
  }));

  // Supabase upsert with ignoreDuplicates: false performs an UPDATE on conflict,
  // but only touches the columns we provide when we use a merge strategy.
  // To avoid clobbering other settings fields, we explicitly use
  // onConflict + only specify display_order in the update:
  const { error } = await supabase.from("user_lecture_settings").upsert(rows, {
    onConflict: "user_id,internal_id",
    ignoreDuplicates: false,
  });

  if (error) {
    console.error("[PUT /api/lectures/reorder] upsert error:", error);
    return NextResponse.json(
      { error: "Failed to update lecture order" },
      { status: 500 }
    );
  }

  // Return the applied order so the client can confirm
  return NextResponse.json({
    updated: order.length,
    order: order.map(({ internalId, displayOrder }) => ({
      internalId,
      displayOrder,
    })),
  });
}
