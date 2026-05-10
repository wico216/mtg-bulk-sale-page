import { requireAdmin } from "@/lib/auth/admin-check";
import { deleteCardsByIds } from "@/db/queries";
import {
  enforceRateLimit,
  clientKeyFromRequest,
  RATE_LIMIT_BUCKETS,
} from "@/lib/rate-limit";
import { logEvent, logError } from "@/lib/logger";

const ROUTE = "/api/admin/cards/bulk-delete";
const MAX_BULK_DELETE_IDS = 500;

function validateIds(value: unknown): string[] | Response {
  if (!Array.isArray(value)) {
    return Response.json({ error: "ids must be a non-empty array" }, { status: 400 });
  }

  if (value.length === 0) {
    return Response.json({ error: "ids must be a non-empty array" }, { status: 400 });
  }

  if (value.length > MAX_BULK_DELETE_IDS) {
    return Response.json(
      { error: `Cannot delete more than ${MAX_BULK_DELETE_IDS} cards at once` },
      { status: 400 },
    );
  }

  if (value.some((id) => typeof id !== "string" || id.trim().length === 0)) {
    return Response.json({ error: "ids must contain only non-empty strings" }, { status: 400 });
  }

  return [...new Set(value)];
}

export async function POST(request: Request) {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  // Bulk delete is expensive -- apply the bulk bucket AFTER auth.
  const rateLimited = await enforceRateLimit({
    key: clientKeyFromRequest(request, result.user.email),
    config: RATE_LIMIT_BUCKETS.ADMIN_BULK,
  });
  if (rateLimited) {
    logEvent({
      level: "warn",
      event: "admin.bulk_delete.rate_limited",
      route: ROUTE,
      actor: result.user.email,
    });
    return rateLimited;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ids = validateIds((body as { ids?: unknown })?.ids);
  if (ids instanceof Response) return ids;

  try {
    const deleted = await deleteCardsByIds(ids, { actorEmail: result.user.email });
    logEvent({
      level: "info",
      event: "admin.bulk_delete.succeeded",
      route: ROUTE,
      actor: result.user.email,
      metadata: { requested: ids.length, deleted: deleted.deleted },
    });
    return Response.json({ success: true, ...deleted });
  } catch (err) {
    logError({
      event: "admin.bulk_delete.failed",
      route: ROUTE,
      actor: result.user.email,
      error: err,
      metadata: { requested: ids.length },
    });
    return Response.json(
      { error: "Bulk delete failed — inventory unchanged" },
      { status: 500 },
    );
  }
}
