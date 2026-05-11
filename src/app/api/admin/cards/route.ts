import { requireAdmin } from "@/lib/auth/admin-check";
import { getAdminCards, deleteAllCards } from "@/db/queries";
import {
  enforceRateLimit,
  clientKeyFromRequest,
  RATE_LIMIT_BUCKETS,
} from "@/lib/rate-limit";
import { logEvent, logError } from "@/lib/logger";

const ROUTE = "/api/admin/cards";

export async function GET(request: Request) {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") ?? "1");
  const limit = parseInt(url.searchParams.get("limit") ?? "50");
  const search = url.searchParams.get("search") ?? "";
  const set = url.searchParams.get("set") ?? "";
  const condition = url.searchParams.get("condition") ?? "";
  const binder = url.searchParams.get("binder") ?? "";
  const sortBy = (url.searchParams.get("sortBy") ?? "name") as
    | "name"
    | "price"
    | "quantity";
  const sortDir = (url.searchParams.get("sortDir") ?? "asc") as
    | "asc"
    | "desc";

  // Validate sortBy
  if (!["name", "price", "quantity"].includes(sortBy)) {
    return Response.json(
      { error: "Invalid sortBy parameter" },
      { status: 400 },
    );
  }

  try {
    const data = await getAdminCards({
      page,
      limit,
      search,
      set,
      condition,
      binder,
      sortBy,
      sortDir,
    });
    return Response.json(data);
  } catch (err) {
    logError({
      event: "admin.cards_list.failed",
      route: ROUTE,
      actor: result.user.email,
      error: err,
      metadata: { page, limit, search, set, condition, binder, sortBy, sortDir },
    });
    // WR-B: match the structured-JSON 5xx invariant. The admin UI consumes
    // this with fetch(...).json(); an HTML 500 from Next breaks the page.
    return Response.json(
      { error: "Failed to load cards" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  // Delete-all is the most destructive admin op. Apply the bulk bucket AFTER
  // auth so an auth bug never gets masked by a 429.
  const rateLimited = await enforceRateLimit({
    key: clientKeyFromRequest(request, result.user.email),
    config: RATE_LIMIT_BUCKETS.ADMIN_BULK,
  });
  if (rateLimited) {
    logEvent({
      level: "warn",
      event: "admin.delete_all.rate_limited",
      route: ROUTE,
      actor: result.user.email,
    });
    return rateLimited;
  }

  try {
    const { deleted } = await deleteAllCards({ actorEmail: result.user.email });
    logEvent({
      level: "info",
      event: "admin.delete_all.succeeded",
      route: ROUTE,
      actor: result.user.email,
      metadata: { deleted },
    });
    return Response.json({ success: true, deleted });
  } catch (err) {
    logError({
      event: "admin.delete_all.failed",
      route: ROUTE,
      actor: result.user.email,
      error: err,
    });
    return Response.json(
      { error: "Delete inventory failed — inventory unchanged" },
      { status: 500 },
    );
  }
}
