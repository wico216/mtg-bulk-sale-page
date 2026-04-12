import "server-only";
import { auth } from "@/auth";
import { isAdminEmail } from "./helpers";

export type AdminSession = {
  user: { email: string; name: string; image?: string };
};

/**
 * Verifies the request has a valid admin session.
 * Returns the session if admin, or a Response with 401/403 error per D-08.
 */
export async function requireAdmin(): Promise<AdminSession | Response> {
  const session = await auth();

  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdminEmail(session.user.email)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  return session as AdminSession;
}
