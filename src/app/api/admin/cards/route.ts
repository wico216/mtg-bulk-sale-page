import { requireAdmin } from "@/lib/auth/admin-check";
import { getAdminCards, deleteAllCards } from "@/db/queries";

export async function GET(request: Request) {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") ?? "1");
  const limit = parseInt(url.searchParams.get("limit") ?? "50");
  const search = url.searchParams.get("search") ?? "";
  const set = url.searchParams.get("set") ?? "";
  const condition = url.searchParams.get("condition") ?? "";
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

  const data = await getAdminCards({
    page,
    limit,
    search,
    set,
    condition,
    sortBy,
    sortDir,
  });
  return Response.json(data);
}

export async function DELETE() {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  try {
    const { deleted } = await deleteAllCards();
    return Response.json({ success: true, deleted });
  } catch (err) {
    console.error("[ADMIN CARDS] delete-all failed:", err);
    return Response.json(
      { error: "Delete inventory failed — inventory unchanged" },
      { status: 500 },
    );
  }
}
