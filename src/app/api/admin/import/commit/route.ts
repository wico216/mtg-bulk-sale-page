import { requireAdmin } from "@/lib/auth/admin-check";
import { replaceAllCards } from "@/db/queries";
import type { CommitRequest, CommitResponse } from "@/lib/import-contract";

export const runtime = "nodejs";
// Commit is fast -- only DB round trips (one batched delete+insert). 30s is
// generous headroom for Neon cold starts; the work itself takes well under a second.
export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  let body: Partial<CommitRequest>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body?.cards)) {
    return Response.json({ error: "Missing cards array" }, { status: 400 });
  }

  try {
    const { inserted } = await replaceAllCards(body.cards);
    const response: CommitResponse = { success: true, inserted };
    return Response.json(response);
  } catch (err) {
    console.error("[IMPORT COMMIT] atomic replace failed:", err);
    return Response.json(
      { error: "Import failed — inventory unchanged" },
      { status: 500 },
    );
  }
}
