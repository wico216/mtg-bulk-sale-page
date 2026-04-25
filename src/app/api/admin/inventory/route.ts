import { requireAdmin } from "@/lib/auth/admin-check";
import { replaceAllCards, getCardsMeta } from "@/db/queries";

export const runtime = "nodejs";
// DB-only path: a single db.batch([db.delete(cards)]) plus a count query.
// 30s is generous headroom for Neon cold starts (matches /commit route).
export const maxDuration = 30;

/**
 * Phase 10.1 D-13/D-14: destructive "Delete all inventory" endpoint.
 *
 * Reads the current totalCards count BEFORE the wipe so the success response
 * can report `deleted: N` -- the UI uses that to render the post-delete toast
 * "Deleted all N cards" (D-14) via the sessionStorage admin-toast handoff.
 *
 * Atomicity: replaceAllCards([]) runs a single-statement db.batch([db.delete(cards)]).
 * That is the only safe atomic primitive on drizzle-orm/neon-http -- never
 * introduce drizzle interactive transactions here (Phase 10 RESEARCH Pitfall 1).
 */
export async function DELETE(): Promise<Response> {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    // Read total BEFORE the destructive call so the response is accurate
    // even when replaceAllCards resolves to { inserted: 0 } (which it does
    // by definition for the empty-array path).
    const meta = await getCardsMeta();
    const previousTotal = meta.totalCards;

    await replaceAllCards([]);

    return Response.json({ success: true, deleted: previousTotal });
  } catch (err) {
    console.error("[INVENTORY DELETE] atomic wipe failed:", err);
    return Response.json(
      { error: "Delete failed — inventory unchanged" },
      { status: 500 },
    );
  }
}
