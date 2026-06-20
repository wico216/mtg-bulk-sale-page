import { deleteCommanderLink } from "@/db/commander-links";
import { requireAdmin } from "@/lib/auth/admin-check";
import {
  clientKeyFromRequest,
  enforceRateLimit,
  RATE_LIMIT_BUCKETS,
} from "@/lib/rate-limit";
import { logError, logEvent } from "@/lib/logger";

const ROUTE = "/api/admin/commander-links/[id]";

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
  if (rateLimited) {
    logEvent({
      level: "warn",
      event: "admin.commander_links.delete_rate_limited",
      route: ROUTE,
      actor: result.user.email,
    });
    return rateLimited;
  }

  const { id: rawId } = await params;
  const id = Number.parseInt(rawId, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Invalid commander link id" }, { status: 400 });
  }

  try {
    const commander = await deleteCommanderLink({
      id,
      actorEmail: result.user.email,
    });
    if (!commander) {
      return Response.json({ error: "Commander link not found" }, { status: 404 });
    }

    logEvent({
      level: "info",
      event: "admin.commander_links.deleted",
      route: ROUTE,
      actor: result.user.email,
      metadata: { id: commander.id, name: commander.name },
    });

    return Response.json({ success: true, commander });
  } catch (err) {
    logError({
      event: "admin.commander_links.delete_failed",
      route: ROUTE,
      actor: result.user.email,
      error: err,
      metadata: { id },
    });
    return Response.json({ error: "Failed to delete commander link" }, { status: 500 });
  }
}
