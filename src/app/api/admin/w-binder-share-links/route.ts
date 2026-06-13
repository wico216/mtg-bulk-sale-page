import {
  createWBinderShareLink,
  listWBinderShareLinks,
  normalizeAllowedWBinders,
  normalizeShareLabel,
  parseShareExpiresAt,
} from "@/db/w-binder-share-links";
import { requireAdmin } from "@/lib/auth/admin-check";
import {
  clientKeyFromRequest,
  enforceRateLimit,
  RATE_LIMIT_BUCKETS,
} from "@/lib/rate-limit";
import { logError, logEvent } from "@/lib/logger";

const ROUTE = "/api/admin/w-binder-share-links";

function makeShareUrl(request: Request, token: string): string {
  const origin = new URL(request.url).origin;
  return `${origin}/share/w-binders/${encodeURIComponent(token)}`;
}

export async function GET() {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  try {
    const links = await listWBinderShareLinks();
    return Response.json({ links });
  } catch (err) {
    logError({
      event: "admin.w_binder_share_links.list_failed",
      route: ROUTE,
      actor: result.user.email,
      error: err,
    });
    return Response.json({ error: "Failed to load W binder share links" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  const rateLimited = await enforceRateLimit({
    key: clientKeyFromRequest(request, result.user.email),
    config: RATE_LIMIT_BUCKETS.ADMIN_MUTATION,
  });
  if (rateLimited) {
    logEvent({
      level: "warn",
      event: "admin.w_binder_share_links.rate_limited",
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

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = body as {
    label?: unknown;
    allowedBinders?: unknown;
    expiresAt?: unknown;
  };

  let label: string;
  let allowedBinders: string[] | null;
  let expiresAt: Date | null;
  try {
    label = normalizeShareLabel(payload.label);
    allowedBinders = normalizeAllowedWBinders(payload.allowedBinders);
    expiresAt = parseShareExpiresAt(payload.expiresAt);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Invalid share-link payload" },
      { status: 400 },
    );
  }

  try {
    const created = await createWBinderShareLink({
      label,
      allowedBinders,
      expiresAt,
      actorEmail: result.user.email,
    });
    const shareUrl = makeShareUrl(request, created.token);

    logEvent({
      level: "info",
      event: "admin.w_binder_share_links.created",
      route: ROUTE,
      actor: result.user.email,
      metadata: {
        id: created.link.id,
        label: created.link.label,
        allowedBinders: created.link.allowedBinders ?? "all_w_binders",
        expiresAt: created.link.expiresAt,
      },
    });

    return Response.json({ success: true, link: created.link, shareUrl });
  } catch (err) {
    logError({
      event: "admin.w_binder_share_links.create_failed",
      route: ROUTE,
      actor: result.user.email,
      error: err,
    });
    return Response.json({ error: "Failed to create W binder share link" }, { status: 500 });
  }
}
