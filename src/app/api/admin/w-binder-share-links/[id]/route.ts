import { revokeWBinderShareLink } from "@/db/w-binder-share-links";
import { requireAdmin } from "@/lib/auth/admin-check";
import {
  clientKeyFromRequest,
  enforceRateLimit,
  RATE_LIMIT_BUCKETS,
} from "@/lib/rate-limit";
import { logError, logEvent } from "@/lib/logger";

const ROUTE = "/api/admin/w-binder-share-links/[id]";

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
      event: "admin.w_binder_share_links.revoke_rate_limited",
      route: ROUTE,
      actor: result.user.email,
    });
    return rateLimited;
  }

  const { id: rawId } = await params;
  const id = Number.parseInt(rawId, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Invalid share link id" }, { status: 400 });
  }

  try {
    const link = await revokeWBinderShareLink({
      id,
      actorEmail: result.user.email,
    });
    if (!link) {
      return Response.json({ error: "Share link not found" }, { status: 404 });
    }

    logEvent({
      level: "info",
      event: "admin.w_binder_share_links.revoked",
      route: ROUTE,
      actor: result.user.email,
      metadata: { id: link.id, label: link.label },
    });

    return Response.json({ success: true, link });
  } catch (err) {
    logError({
      event: "admin.w_binder_share_links.revoke_failed",
      route: ROUTE,
      actor: result.user.email,
      error: err,
      metadata: { id },
    });
    return Response.json({ error: "Failed to revoke W binder share link" }, { status: 500 });
  }
}
