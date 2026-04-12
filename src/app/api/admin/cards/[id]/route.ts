import { requireAdmin } from "@/lib/auth/admin-check";
import { updateCard, deleteCard } from "@/db/queries";
import { abbrToCondition, CONDITION_OPTIONS } from "@/lib/condition-map";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  const { id } = await params;
  const body = await request.json();

  // Build validated updates
  const updates: { price?: number; quantity?: number; condition?: string } = {};

  if (body.price !== undefined) {
    const price = parseFloat(body.price);
    if (isNaN(price) || price < 0) {
      return Response.json({ error: "Invalid price" }, { status: 400 });
    }
    updates.price = price; // dollars -- updateCard converts to cents
  }

  if (body.quantity !== undefined) {
    const qty = parseInt(body.quantity, 10);
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

  const updated = await updateCard(id, updates);
  if (!updated) {
    return Response.json({ error: "Card not found" }, { status: 404 });
  }

  return Response.json({ success: true, card: updated });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  const { id } = await params;
  const deleted = await deleteCard(id);

  if (!deleted) {
    return Response.json({ error: "Card not found" }, { status: 404 });
  }

  return Response.json({ success: true });
}
