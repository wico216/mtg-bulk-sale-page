import { requireAdmin } from "@/lib/auth/admin-check";
import { normalizeBinderName } from "@/lib/binder-name";
import { parseManaboxCsvContents } from "@/lib/csv-parser";
import { enrichCards } from "@/lib/enrichment";
import {
  IMPORT_FILE_FIELD,
  type BinderSummary,
  type ImportStreamMessage,
  type PreviewPayload,
} from "@/lib/import-contract";
import {
  enforceRateLimit,
  clientKeyFromRequest,
  RATE_LIMIT_BUCKETS,
} from "@/lib/rate-limit";
import { logEvent } from "@/lib/logger";
import type { InventoryRow } from "@/lib/types";

// Phase 22-01 D-03 / D-DOS-01 resolution: stable route literal for structured
// log emissions. Mirrors the convention used by import/commit/route.ts.
const ROUTE = "/api/admin/import/preview";

export const runtime = "nodejs";

// D-10: Scryfall first-import ~150 cards x 100ms/card rate limit ~= 15s, and
// a slow connection uploading the CSV adds a few seconds on top. We set
// 300s to cover the worst-case first-import-of-a-fresh-binder scenario
// while still fitting inside Vercel Pro's 300s Route Handler ceiling.
// Subsequent imports hit the 24h Scryfall cache and finish in under a second.
export const maxDuration = 300;

// Phase 19 D-16: defense against client tampering.
const MAX_SELECTED_BINDERS = 200;
const MAX_KNOWN_BINDERS = 200;

/**
 * Group parsed cards by binder and produce the picker-ready BinderSummary[]
 * surface. Sort is alphabetical-by-name for deterministic snapshots; the
 * client (Plan 19-02) re-sorts visually per D-05 (NEW first, unsorted last).
 */
function buildBindersFromParsed(
  cards: InventoryRow[],
  knownBinders: string[],
): BinderSummary[] {
  const knownSet = new Set(knownBinders.map(normalizeBinderName));
  const groups = new Map<string, { rowCount: number; sampleNames: string[] }>();
  for (const card of cards) {
    let group = groups.get(card.binder);
    if (!group) {
      group = { rowCount: 0, sampleNames: [] };
      groups.set(card.binder, group);
    }
    group.rowCount += 1;
    if (group.sampleNames.length < 5) group.sampleNames.push(card.name);
  }
  return Array.from(groups.entries())
    .map(([name, g]) => ({
      name,
      rowCount: g.rowCount,
      sampleNames: g.sampleNames,
      isNew: !knownSet.has(name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  // Phase 22-01 D-03 / D-DOS-01 resolution: post-auth rate-limit gate.
  // The expensive parse + Scryfall enrichment pass is gated by ADMIN_BULK
  // (20/min). Mirrors import/commit/route.ts:121-138 verbatim, substituting
  // the event name. The 429 short-circuits BEFORE request.formData(),
  // BEFORE parseManaboxCsvContents, BEFORE enrichCards.
  const rateLimited = await enforceRateLimit({
    key: clientKeyFromRequest(request, auth.user.email),
    config: RATE_LIMIT_BUCKETS.ADMIN_BULK,
  });
  if (rateLimited) {
    logEvent({
      level: "warn",
      event: "admin.import_preview.rate_limited",
      route: ROUTE,
      actor: auth.user.email,
    });
    return rateLimited;
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const rawFiles = formData.getAll(IMPORT_FILE_FIELD);
  const files = rawFiles.filter((item): item is File => item instanceof File);
  if (files.length === 0) {
    return Response.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (files.length !== rawFiles.length) {
    return Response.json({ error: "Uploaded fields must be files" }, { status: 400 });
  }
  const invalidFile = files.find((file) => !file.name.toLowerCase().endsWith(".csv"));
  if (invalidFile) {
    return Response.json({ error: "All uploaded files must be .csv" }, { status: 400 });
  }

  const uploaded = await Promise.all(
    files.map(async (file) => ({
      fileName: file.name,
      content: await file.text(),
    })),
  );
  const parsed = parseManaboxCsvContents(uploaded);

  // ---- knownBinders parsing (loose; never 400s) -----------------------------
  const knownBindersRaw = formData.get("knownBinders");
  let knownBinders: string[] = [];
  if (typeof knownBindersRaw === "string") {
    try {
      const knownBindersInput = JSON.parse(knownBindersRaw) as unknown;
      if (Array.isArray(knownBindersInput)) {
        knownBinders = knownBindersInput
          .filter((s): s is string => typeof s === "string")
          .slice(0, MAX_KNOWN_BINDERS)
          .map(normalizeBinderName);
      }
    } catch {
      // Silently ignore malformed knownBinders; worst case every binder
      // shows as NEW which is a benign UI degradation (D-16 forgiving rule).
    }
  }

  // ---- selectedBinders validation (strict; 400 on any failure, BEFORE
  //      stream opens — D-16) -------------------------------------------------
  let selectedBinders: string[] | undefined;
  const selectedBindersRaw = formData.get("selectedBinders");
  if (typeof selectedBindersRaw === "string") {
    try {
      const selectedBindersInput = JSON.parse(selectedBindersRaw) as unknown;
      if (!Array.isArray(selectedBindersInput)) {
        throw new Error("selectedBinders must be a JSON array");
      }
      if (selectedBindersInput.length > MAX_SELECTED_BINDERS) {
        throw new Error(
          `selectedBinders length exceeds ${MAX_SELECTED_BINDERS}`,
        );
      }
      if (
        !selectedBindersInput.every((s): s is string => typeof s === "string")
      ) {
        throw new Error("selectedBinders entries must be strings");
      }
      // D-16: every entry must equal its normalized form.
      for (const s of selectedBindersInput) {
        if (s !== normalizeBinderName(s)) {
          throw new Error(`selectedBinders entry "${s}" is not normalized`);
        }
      }
      // Defense: every selectedBinder MUST be a binder the parser actually
      // found in this upload (catches stale localStorage from a prior import
      // referencing a binder no longer in the export).
      const uploadedBinderSet = new Set(parsed.cards.map((c) => c.binder));
      for (const s of selectedBindersInput) {
        if (!uploadedBinderSet.has(s)) {
          throw new Error(
            `selectedBinders entry "${s}" not present in this upload`,
          );
        }
      }
      selectedBinders = selectedBindersInput;
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Invalid selectedBinders" },
        { status: 400 },
      );
    }
  }

  // ---- Stage 1 binders summary (built once, sent FIRST in the stream) ------
  const bindersSummary = buildBindersFromParsed(parsed.cards, knownBinders);
  // Scope enrichment input: when selectedBinders is defined, only enrich
  // those rows. Phase 19 D-02.
  const cardsToEnrich = selectedBinders
    ? parsed.cards.filter((c) => selectedBinders!.includes(c.binder))
    : parsed.cards;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (msg: ImportStreamMessage) => {
        controller.enqueue(encoder.encode(JSON.stringify(msg) + "\n"));
      };

      try {
        // FIRST: binders message (D-01 — fires after parse, BEFORE
        // any progress/enrichment). Always sent.
        send({ type: "binders", binders: bindersSummary });

        const total = cardsToEnrich.length;
        send({ type: "progress", done: 0, total, stage: "enrich" });

        const {
          cards: enriched,
          stats,
          scryfallMisses,
        } = await enrichCards(cardsToEnrich, {
          onProgress: (done, totalCount) => {
            send({ type: "progress", done, total: totalCount, stage: "enrich" });
          },
        });

        const preview: PreviewPayload = {
          toImport: enriched.length,
          parseSkipped: parsed.skippedRows.length,
          scryfallSkipped: scryfallMisses.length,
          missingPrices: stats.missingPrices,
          sample: enriched.slice(0, 20),
          skippedRows: [
            ...parsed.skippedRows.map((r) => ({
              kind: "parse" as const,
              rowNumber: r.rowNumber,
              reason: r.reason,
              name: r.name,
              setCode: r.setCode,
              collectorNumber: r.collectorNumber,
              fileName: r.fileName,
            })),
            ...scryfallMisses.map((m) => ({
              kind: "enrich" as const,
              setCode: m.setCode,
              collectorNumber: m.collectorNumber,
              name: m.name,
              reason: m.reason,
            })),
          ],
          sourceFiles: parsed.sourceFiles ?? [],
          cards: enriched,
        };

        send({ type: "result", preview });
      } catch (err) {
        send({
          type: "error",
          message:
            err instanceof Error ? err.message : "Unknown enrichment error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      // RESEARCH Pitfall 2: prevent proxy/CDN buffering so progress lines
      // flush to the client as soon as they are produced.
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
