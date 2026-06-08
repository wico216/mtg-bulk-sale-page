import { requireAdmin } from "@/lib/auth/admin-check";
import { normalizeBinderName } from "@/lib/binder-name";
import { replaceCardsForBinders } from "@/db/queries";
import {
  enforceRateLimit,
  clientKeyFromRequest,
  RATE_LIMIT_BUCKETS,
} from "@/lib/rate-limit";
import { logEvent, logError } from "@/lib/logger";
import type {
  CommitRequest,
  CommitResponse,
  CommitSummary,
} from "@/lib/import-contract";

const ROUTE = "/api/admin/import/commit";

export const runtime = "nodejs";
// Commit is fast -- only DB round trips (one batched delete+insert). 30s is
// generous headroom for Neon cold starts; the work itself takes well under a second.
export const maxDuration = 30;

const MAX_SELECTED_BINDERS = 200;
const MAX_KNOWN_BINDERS = 200;

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

/**
 * Phase 19: validate body.selectedBinders strictly. Returns either the
 * validated string[] OR a Response (400) the caller should return immediately.
 */
function validateSelectedBinders(
  raw: unknown,
  cards: Array<{ binder: string }>,
): string[] | Response {
  if (!Array.isArray(raw)) {
    return Response.json(
      { error: "selectedBinders must be an array" },
      { status: 400 },
    );
  }
  if (raw.length > MAX_SELECTED_BINDERS) {
    return Response.json(
      { error: `selectedBinders length exceeds ${MAX_SELECTED_BINDERS}` },
      { status: 400 },
    );
  }
  if (!raw.every((s): s is string => typeof s === "string")) {
    return Response.json(
      { error: "selectedBinders entries must be strings" },
      { status: 400 },
    );
  }
  for (const s of raw) {
    if (s !== normalizeBinderName(s)) {
      return Response.json(
        { error: `selectedBinders entry "${s}" is not normalized` },
        { status: 400 },
      );
    }
  }
  // Every card.binder MUST be in selectedBinders (the typed
  // deletedFromUnselected: 0 invariant — Plan 19-01 D-18). selectedBinders
  // may intentionally include binders that are missing from body.cards: those
  // are delete-only binders from the will-delete panel, and
  // replaceCardsForBinders supports deleting them without inserting rows.
  const selectedSet = new Set(raw);
  for (const c of cards) {
    if (!selectedSet.has(c.binder)) {
      return Response.json(
        {
          error: `card.binder "${c.binder}" not in selectedBinders`,
        },
        { status: 400 },
      );
    }
  }
  return raw;
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  // Import commit replaces inventory wholesale -- bulk bucket post-auth.
  const rateLimited = await enforceRateLimit({
    key: clientKeyFromRequest(request, auth.user.email),
    config: RATE_LIMIT_BUCKETS.ADMIN_BULK,
  });
  if (rateLimited) {
    logEvent({
      level: "warn",
      event: "admin.import_commit.rate_limited",
      route: ROUTE,
      actor: auth.user.email,
    });
    return rateLimited;
  }

  let body: Partial<CommitRequest>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body?.cards)) {
    return Response.json({ error: "Missing cards array" }, { status: 400 });
  }

  // ---- selectedBinders default-resolution + strict validation (D-15/D-16) --
  let selectedBinders: string[];
  if (body.selectedBinders === undefined) {
    // Legacy single-button-import flow: replace every binder mentioned in
    // this upload (correctness-equivalent to the prior wholesale path).
    selectedBinders = Array.from(new Set(body.cards.map((c) => c.binder)));
  } else {
    const validated = validateSelectedBinders(body.selectedBinders, body.cards);
    if (validated instanceof Response) return validated;
    selectedBinders = validated;
  }

  if (
    body.cards.length === 0 &&
    toNonNegativeInteger(body.summary?.scryfallSkipped) > 0
  ) {
    logEvent({
      level: "warn",
      event: "admin.import_commit.zero_card_enrichment_failure",
      route: ROUTE,
      actor: auth.user.email,
      metadata: {
        selectedBindersCount: selectedBinders.length,
        scryfallSkipped: toNonNegativeInteger(body.summary?.scryfallSkipped),
      },
    });
    return Response.json(
      {
        error:
          "Import preview enriched 0 cards. Inventory unchanged — please retry the import.",
      },
      { status: 400 },
    );
  }

  // ---- knownBinders (loose; never 400s) ------------------------------------
  let knownBinders: string[] = [];
  if (Array.isArray(body.knownBinders)) {
    knownBinders = body.knownBinders
      .filter((s): s is string => typeof s === "string")
      .slice(0, MAX_KNOWN_BINDERS)
      .map(normalizeBinderName);
  }

  try {
    const importMetadata = buildImportAuditMetadata(body.summary, body.cards.length);
    const { inserted } = await replaceCardsForBinders(
      body.cards,
      selectedBinders,
      {
        actorEmail: auth.user.email,
        metadata: importMetadata,
        knownBinders,
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
      },
    );
    logEvent({
      level: "info",
      event: "admin.import_commit.succeeded",
      route: ROUTE,
      actor: auth.user.email,
      metadata: {
        fileCount: importMetadata.fileCount,
        parsedRows: importMetadata.parsedRows,
        skippedRows: importMetadata.skippedRows,
        insertedCards: inserted,
        selectedBindersCount: selectedBinders.length,
      },
    });
    const response: CommitResponse = { success: true, inserted };
    return Response.json(response);
  } catch (err) {
    logError({
      event: "admin.import_commit.failed",
      route: ROUTE,
      actor: auth.user.email,
      error: err,
      metadata: { cardCount: body.cards.length },
    });
    return Response.json(
      { error: "Import failed — inventory unchanged" },
      { status: 500 },
    );
  }
}
