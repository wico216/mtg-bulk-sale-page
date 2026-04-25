import { requireAdmin } from "@/lib/auth/admin-check";
import { parseManaboxCsvFiles } from "@/lib/csv-parser";
import { enrichCards } from "@/lib/enrichment";
import {
  IMPORT_FILE_FIELD,
  type ImportStreamMessage,
  type PreviewPayload,
} from "@/lib/import-contract";

export const runtime = "nodejs";

// D-10: Scryfall first-import ~150 cards x 100ms/card rate limit ~= 15s, and
// a slow connection uploading the CSV adds a few seconds on top. We set
// 300s to cover the worst-case first-import-of-a-fresh-binder scenario
// while still fitting inside Vercel Pro's 300s Route Handler ceiling.
// Subsequent imports hit the 24h Scryfall cache and finish in under a second.
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  // 10.1 D-01: accept ANY number of CSV parts under the same field name.
  // Client appends each File via fd.append(IMPORT_FILE_FIELD, file) — so
  // getAll() returns one entry per file in upload order.
  const rawFiles = formData.getAll(IMPORT_FILE_FIELD);
  const files = rawFiles.filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return Response.json({ error: "No file uploaded" }, { status: 400 });
  }
  for (const f of files) {
    if (!f.name.toLowerCase().endsWith(".csv")) {
      return Response.json(
        { error: "All files must be .csv" },
        { status: 400 },
      );
    }
  }

  const fileContents = await Promise.all(
    files.map(async (f) => ({ filename: f.name, content: await f.text() })),
  );
  const parsed = parseManaboxCsvFiles(fileContents);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (msg: ImportStreamMessage) => {
        controller.enqueue(encoder.encode(JSON.stringify(msg) + "\n"));
      };

      try {
        const total = parsed.cards.length;
        send({ type: "progress", done: 0, total, stage: "enrich" });

        const {
          cards: enriched,
          stats,
          scryfallMisses,
        } = await enrichCards(parsed.cards, {
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
              filename: r.filename, // 10.1 D-08: source CSV provenance for the UI
            })),
            ...scryfallMisses.map((m) => ({
              kind: "enrich" as const,
              setCode: m.setCode,
              collectorNumber: m.collectorNumber,
              name: m.name,
              reason: m.reason,
            })),
          ],
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
