import { requireAdmin } from "@/lib/auth/admin-check";
import { updateCard, deleteCard } from "@/db/queries";
import { abbrToCondition, CONDITION_OPTIONS } from "@/lib/condition-map";
import {
  enforceRateLimit,
  clientKeyFromRequest,
  RATE_LIMIT_BUCKETS,
} from "@/lib/rate-limit";
import { logError } from "@/lib/logger";

const ROUTE = "/api/admin/cards/[id]";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  // Rate-limit per admin identity (post-auth) so two admins on the same NAT
  // do not share a bucket.
  const rateLimited = await enforceRateLimit({
    key: clientKeyFromRequest(request, result.user.email),
    config: RATE_LIMIT_BUCKETS.ADMIN_MUTATION,
  });
  if (rateLimited) return rateLimited;

  const { id } = await params;
  // WR-B: every admin route's 5xx must be structured JSON so the admin UI's
  // `fetch(...).then(r => r.json())` consumer never trips on an HTML error
  // page. A malformed JSON body falls into 400 JSON, not Next's HTML 500.
  let body: { price?: unknown; quantity?: unknown; condition?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Build validated updates
  const updates: { price?: number; quantity?: number; condition?: string } = {};

  if (body.price !== undefined) {
    const price = parseFloat(body.price as string);
    if (isNaN(price) || price < 0) {
      return Response.json({ error: "Invalid price" }, { status: 400 });
    }
    updates.price = price; // dollars -- updateCard converts to cents
  }

  if (body.quantity !== undefined) {
    const qty = parseInt(body.quantity as string, 10);
    if (isNaN(qty) || qty < 0) {
      return Response.json({ error: "Invalid quantity" }, { status: 400 });
    }
    updates.quantity = qty;
  }

  if (body.condition !== undefined) {
    const condAbbr = String(body.condition);
    if (
      !CONDITION_OPTIONS.includes(condAbbr as (typeof CONDITION_OPTIONS)[number])
    ) {
      return Response.json(
        { error: "Invalid condition. Must be one of: NM, LP, MP, HP, DMG" },
        { status: 400 },
      );
    }
    updates.condition = abbrToCondition(condAbbr); // Convert NM -> near_mint for DB
  }

  if (Object.keys(updates).length === 0) {
    return Response.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  try {
    const updated = await updateCard(id, updates, {
      actorEmail: result.user.email,
    });
    if (!updated) {
      return Response.json({ error: "Card not found" }, { status: 404 });
    }
    return Response.json({ success: true, card: updated });
  } catch (err) {
    logError({
      event: "admin.card_update.failed",
      route: ROUTE,
      actor: result.user.email,
      error: err,
      metadata: { cardId: id },
    });
    // WR-B: match the "5xx -> JSON" invariant the rest of the admin routes
    // uphold (orders/[id] PATCH, orders/[id]/cancel POST, cards/bulk-delete,
    // delete-all, import-commit). Re-throwing surfaces Next's default HTML
    // 500 and breaks the admin UI's fetch(...).json() consumer.
    return Response.json(
      { error: "Card update failed — card unchanged" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  const rateLimited = await enforceRateLimit({
    key: clientKeyFromRequest(request, result.user.email),
    config: RATE_LIMIT_BUCKETS.ADMIN_MUTATION,
  });
  if (rateLimited) return rateLimited;

  const { id } = await params;
  try {
    const deleted = await deleteCard(id, { actorEmail: result.user.email });
    if (!deleted) {
      return Response.json({ error: "Card not found" }, { status: 404 });
    }
    return Response.json({ success: true });
  } catch (err) {
    logError({
      event: "admin.card_delete.failed",
      route: ROUTE,
      actor: result.user.email,
      error: err,
      metadata: { cardId: id },
    });
    // WR-B: see PATCH handler comment.
    return Response.json(
      { error: "Card delete failed — card unchanged" },
      { status: 500 },
    );
  }
}
