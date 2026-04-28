import { requireAdmin } from "@/lib/auth/admin-check";
import { replaceAllCards } from "@/db/queries";
import type { CommitRequest, CommitResponse, CommitSummary } from "@/lib/import-contract";

export const runtime = "nodejs";
// Commit is fast -- only DB round trips (one batched delete+insert). 30s is
// generous headroom for Neon cold starts; the work itself takes well under a second.
export const maxDuration = 30;

function toNonNegativeInteger(value: unknown): number {
  return Number.isFinite(value)
    ? Math.max(0, Math.trunc(value as number))
    : 0;
}

function buildImportAuditMetadata(
  summary: CommitSummary | undefined,
  inserted: number,
): Record<string, unknown> {
  const sourceFiles = Array.isArray(summary?.sourceFiles)
    ? (summary.sourceFiles as Array<Partial<{ name: unknown; parsedCards: unknown }>>)
        .map((file) => ({
          name: typeof file.name === "string" ? file.name : "unknown.csv",
          parsedCards: toNonNegativeInteger(file.parsedCards),
        }))
    : [];
  const parseSkipped = toNonNegativeInteger(summary?.parseSkipped);
  const scryfallSkipped = toNonNegativeInteger(summary?.scryfallSkipped);

  return {
    fileNames: sourceFiles.map((file) => file.name),
    fileCount: sourceFiles.length,
    parsedRows: sourceFiles.reduce((total, file) => total + file.parsedCards, 0),
    skippedRows: parseSkipped + scryfallSkipped,
    parseSkipped,
    scryfallSkipped,
    missingPrices: toNonNegativeInteger(summary?.missingPrices),
    insertedCards: inserted,
  };
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  let body: Partial<CommitRequest>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body?.cards)) {
    return Response.json({ error: "Missing cards array" }, { status: 400 });
  }

  try {
    const importMetadata = buildImportAuditMetadata(body.summary, body.cards.length);
    const { inserted } = await replaceAllCards(body.cards, {
      actorEmail: auth.user.email,
      metadata: importMetadata,
      importHistory: {
        actorEmail: auth.user.email,
        fileNames: importMetadata.fileNames as string[],
        fileCount: importMetadata.fileCount as number,
        parsedRows: importMetadata.parsedRows as number,
        skippedRows: importMetadata.skippedRows as number,
        insertedCards: body.cards.length,
        metadata: {
          parseSkipped: importMetadata.parseSkipped,
          scryfallSkipped: importMetadata.scryfallSkipped,
          missingPrices: importMetadata.missingPrices,
        },
      },
    });
    const response: CommitResponse = { success: true, inserted };
    return Response.json(response);
  } catch (err) {
    console.error("[IMPORT COMMIT] atomic replace failed:", err);
    return Response.json(
      { error: "Import failed — inventory unchanged" },
      { status: 500 },
    );
  }
}
