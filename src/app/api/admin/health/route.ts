import { requireAdmin } from "@/lib/auth/admin-check";

export async function GET() {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  return Response.json({ status: "ok", admin: result.user.email });
}
