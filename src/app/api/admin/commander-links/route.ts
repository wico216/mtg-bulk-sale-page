import {
  buildEdhrecCommanderUrl,
  createCommanderLink,
  listCommanderLinks,
  normalizeCommanderImageUrl,
  normalizeCommanderName,
  normalizeEdhrecUrl,
} from "@/db/commander-links";
import { requireAdmin } from "@/lib/auth/admin-check";
import {
  clientKeyFromRequest,
  enforceRateLimit,
  RATE_LIMIT_BUCKETS,
} from "@/lib/rate-limit";
import { logError, logEvent } from "@/lib/logger";

const ROUTE = "/api/admin/commander-links";

export async function GET() {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  try {
    const commanders = await listCommanderLinks();
    return Response.json({ commanders });
  } catch (err) {
    logError({
      event: "admin.commander_links.list_failed",
      route: ROUTE,
      actor: result.user.email,
      error: err,
    });
    return Response.json({ error: "Failed to load commander links" }, { status: 500 });
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
      event: "admin.commander_links.rate_limited",
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
    name?: unknown;
    edhrecUrl?: unknown;
    imageUrl?: unknown;
  };

  let name: string;
  let edhrecUrl: string;
  let imageUrl: string | null;
  try {
    name = normalizeCommanderName(payload.name);
    const rawEdhrecUrl = typeof payload.edhrecUrl === "string" ? payload.edhrecUrl.trim() : "";
    if (payload.edhrecUrl !== undefined && payload.edhrecUrl !== null && typeof payload.edhrecUrl !== "string") {
      throw new Error("edhrecUrl must be a string");
    }
    edhrecUrl = rawEdhrecUrl ? normalizeEdhrecUrl(rawEdhrecUrl) : buildEdhrecCommanderUrl(name);
    imageUrl = normalizeCommanderImageUrl(payload.imageUrl);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Invalid commander link payload" },
      { status: 400 },
    );
  }

  try {
    const commander = await createCommanderLink({
      name,
      edhrecUrl,
      imageUrl,
      actorEmail: result.user.email,
    });

    logEvent({
      level: "info",
      event: "admin.commander_links.created",
      route: ROUTE,
      actor: result.user.email,
      metadata: { id: commander.id, name: commander.name },
    });

    return Response.json({ success: true, commander });
  } catch (err) {
    logError({
      event: "admin.commander_links.create_failed",
      route: ROUTE,
      actor: result.user.email,
      error: err,
      metadata: { name },
    });
    return Response.json({ error: "Failed to create commander link" }, { status: 500 });
  }
}
