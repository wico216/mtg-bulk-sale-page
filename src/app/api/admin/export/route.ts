import { requireAdmin } from "@/lib/auth/admin-check";
import { getAllCardsForExport } from "@/db/queries";

/**
 * Escape a value for CSV output.
 * Quotes fields containing commas, newlines, or double quotes.
 * Also escapes cells starting with =, +, -, @ to prevent CSV injection (STRIDE: Tampering T-09-03).
 */
function csvEscape(value: string | null): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (
    str.includes(",") ||
    str.includes("\n") ||
    str.includes('"') ||
    str.startsWith("=") ||
    str.startsWith("+") ||
    str.startsWith("-") ||
    str.startsWith("@")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET() {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  const rows = await getAllCardsForExport();

  const header =
    "Name,Set Code,Set Name,Collector Number,Price,Condition,Quantity,Rarity,Foil";
  const lines = rows.map((row) =>
    [
      csvEscape(row.name),
      csvEscape(row.setCode),
      csvEscape(row.setName),
      csvEscape(row.collectorNumber),
      row.price !== null ? (row.price / 100).toFixed(2) : "",
      csvEscape(row.condition),
      row.quantity.toString(),
      csvEscape(row.rarity),
      row.foil ? "foil" : "normal",
    ].join(","),
  );

  const csv = [header, ...lines].join("\n");
  const date = new Date().toISOString().split("T")[0];

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="viki-inventory-${date}.csv"`,
    },
  });
}
