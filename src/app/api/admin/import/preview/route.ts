import { requireAdmin } from "@/lib/auth/admin-check";
import { parseManaboxCsvContents } from "@/lib/csv-parser";
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
