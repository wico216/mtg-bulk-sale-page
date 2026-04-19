# Phase 10: CSV Import - Research

**Researched:** 2026-04-19
**Domain:** Next.js 16 Route Handler multipart upload + streaming progress + Drizzle/Neon atomic bulk replace
**Confidence:** HIGH (all critical findings verified against installed `node_modules` sources — not training data)

## Summary

Phase 10 adds a destructive, atomic "upload CSV → preview → confirm replace" flow to the admin panel. Three pieces of hard truth drive the plan:

1. **Drizzle's `db.transaction()` does NOT work on the `neon-http` driver this project uses.** Source inspection of `node_modules/drizzle-orm/neon-http/session.js` shows `transaction()` throws `"No transactions support in neon-http driver"`. However, the same file shows `db.batch([...])` IS implemented and is routed through Neon's HTTP `transaction()` batch endpoint, which Neon documents as executing atomically — all statements commit together or all roll back. `db.batch()` is the correct primitive for CSV-01's "single transaction" requirement. Do not switch drivers for this phase.
2. **Next.js 16 Route Handlers support `request.formData()` for multipart uploads** with no special config. No body-size limit applies at the Next.js level for Route Handlers (the 1MB `bodySizeLimit` cap is a Server Actions concern, not Route Handlers). `export const maxDuration = 300` remains a valid route segment config in Next.js 16 — verified in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md`.
3. **Streaming progress** is best implemented as newline-delimited JSON (NDJSON) over a single streamed `Response` from the preview Route Handler. The Next.js 16 docs show this exact pattern using `new Response(new ReadableStream(...))`. SSE is overkill for a single-request counter; polling requires shared memory which is not reliable on Vercel's horizontally scaled functions.

**Primary recommendation:** Build two Route Handlers — `POST /api/admin/import/preview` (multipart upload → parse → stream NDJSON progress + final preview payload → client keeps payload in memory) and `POST /api/admin/import/commit` (JSON body of enriched cards → `db.batch([delete, insert])` → redirect). Add `onProgress(done,total)` callback to `enrichCards()`. Add `parseManaboxCsvContent(content: string)` to `csv-parser.ts`. Add `replaceAllCards(cards: Card[])` to `queries.ts`. Silently drop unknown IDs in the cart page client.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Upload location & UX**
- **D-01:** Import lives on a dedicated route `/admin/import` (not a modal or inline panel on `/admin`).
- **D-02:** Entry point is an "Import CSV" button in the admin inventory action bar, next to "Export CSV".
- **D-03:** File input is a drag-drop zone that doubles as click-to-browse.
- **D-04:** Pre-upload validation is minimal — reject files that do not have the `.csv` extension. No size cap, no header-schema gate.

**Preview content & flow**
- **D-05:** Preview screen has three zones — (1) summary counts ("X cards will be imported, Y rows skipped, Z missing prices"); (2) sample of the first ~20 imported cards (name, set, quantity, price, condition); (3) expandable "Skipped rows" section listing each skipped row with row number and reason.
- **D-06:** Scryfall enrichment happens DURING preview generation, not after confirm.
- **D-07:** Preview screen has two actions — "Confirm import" (commits) and "Cancel" (discards). No auto-commit, no timed confirmation.

**Enrichment timing & progress UX**
- **D-08:** Enrichment runs synchronously in the POST handler for preview. No background job queue.
- **D-09:** Progress is reported as a live "X / Y cards enriched" counter. Implementation mechanism (SSE / streamed response / polling) is Claude's discretion — pick the simplest that reliably renders the counter.
- **D-10:** Route Handler uses `export const maxDuration = 300` (segment config) for the 300s Vercel Pro ceiling. Document this in the route file.
- **D-11:** Reuse the existing 24-hour Scryfall cache (`src/lib/cache.ts`). Re-imports cache-hot; first import pays the 100ms/card rate limit.

**Destructive replace confirmation**
- **D-12:** Final confirmation is a single "Confirm import" button whose label includes the delta, e.g. "Confirm import — replace all 136 current cards with 143 new cards". The delta IS the safeguard. No checkbox, no type-to-confirm.
- **D-13:** Cart safety — the cart page reconciles cart IDs against current DB and silently drops any IDs no longer present. Verify `src/app/cart/page.tsx`'s DB query already filters unknown IDs; if not, patch it as part of this phase.

**Transaction & post-import**
- **D-14:** DB replace is a single Drizzle `db.transaction()`: DELETE all rows from `cards`, then INSERT the enriched batch. All-or-nothing. Rolls back on any error.
- **D-15:** After a successful commit, the admin is redirected to `/admin` with a success toast: "Imported N cards (M skipped)". No intermediate summary screen.
- **D-16:** After a successful commit, the storefront inventory reflects the new data. Pages render dynamic (`force-dynamic`) per Phase 7 — no explicit `revalidatePath` required, but the planner may add one as belt-and-suspenders.

### Claude's Discretion
- Exact mechanism for streaming live enrichment progress (SSE, chunked response, or polling endpoint) — pick the simplest that works in Next.js 16 Route Handlers.
- Visual styling of the drag-drop zone (dashed border, hover/active states).
- Toast message wording beyond the "Imported N cards (M skipped)" template.
- How to display a Scryfall 429 / transient failure mid-enrichment (retry-with-backoff or surface error and stop).
- Error UI when parse fails entirely (zero valid rows): stay on `/admin/import` with an inline error banner.
- Whether the "Import CSV" button is disabled when admin inventory is still loading.
- Schema of the in-flight progress payload.

### Deferred Ideas (OUT OF SCOPE)
- Differential/merge import — explicitly out of scope per REQUIREMENTS.md.
- Scheduled/automated imports — out of scope per REQUIREMENTS.md Out of Scope table.
- Admin undo / CSV snapshot before destructive replace — the existing Export CSV (Phase 9) covers manual pre-flight.
- Real-time Scryfall price refresh (not tied to import) — out of scope per PROJECT.md.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CSV-01 | Admin can import a Manabox CSV to replace full inventory (single transaction) | `db.batch()` on `neon-http` is atomic per `node_modules/drizzle-orm/neon-http/session.js:117-133` routing through Neon's HTTP `transaction()` endpoint; Drizzle docs confirm "if any statement fails, the entire transaction rolls back" |
| CSV-02 | Import shows a preview (cards to add, rows skipped) before committing | Existing `enrichCards()` returns `EnrichmentStats {processed, skipped, missingPrices}`; parser tolerates bad rows by `continue`. Extend enrichment to emit skipped-row detail (row number + reason) so the preview can list them. |
</phase_requirements>

## Project Constraints (from CLAUDE.md / AGENTS.md)

CLAUDE.md imports AGENTS.md verbatim. The single directive:

> **This is NOT the Next.js you know.** Read `node_modules/next/dist/docs/` before writing code. Heed deprecation notices.

Concrete implications for this phase, confirmed against the installed docs:

| Rule | Source in installed docs | Applies to Phase 10? |
|------|--------------------------|----------------------|
| `params`/`searchParams`/`cookies`/`headers` are async-only in Next.js 16 | `01-app/02-guides/upgrading/version-16.md` "Async Request APIs (Breaking change)" | No dynamic params in the new routes — N/A |
| `middleware` → `proxy` rename; `edge` runtime not supported in `proxy` | version-16.md "`middleware` to `proxy`" | N/A (project already on `proxy.ts`) |
| `revalidatePath`/`revalidateTag` signatures evolved (cacheLife optional 2nd arg) | version-16.md "Caching APIs" | Optional — `force-dynamic` pages don't need revalidate |
| Route Handlers accept `request.formData()` without special config | `03-file-conventions/route.md` §"Request Body FormData" | YES — primary mechanism for upload |
| `maxDuration` segment config remains valid | `02-route-segment-config/maxDuration.md` (introduced v13.4.10, still listed in index) | YES — D-10 |
| `dynamic` and `revalidate` route segment configs are removed **only when `cacheComponents` is enabled** | `02-route-segment-config/index.md` version history | N/A — this project does NOT enable `cacheComponents` (`next.config.ts` inspected) |
| `bodySizeLimit` is a Server Actions concern, NOT Route Handlers | `05-config/01-next-config-js/serverActions.md` | Route Handler multipart has no Next.js-imposed cap |
| Turbopack is default in `next build` | version-16.md | No project impact (no custom webpack) |

## Standard Stack

### Core
| Library | Version (verified) | Purpose | Why Standard |
|---------|--------------------|---------|--------------|
| `next` | 16.2.2 | Route Handlers, streaming `Response`, segment config | Already installed |
| `react` / `react-dom` | 19.2.4 | Client-side drag-drop + streaming consumer | Already installed |
| `papaparse` | 5.5.3 | CSV parsing | Already used in `src/lib/csv-parser.ts`; works on a string input, so no refactor of the parser engine — only a new entry point that accepts content |
| `drizzle-orm` | 0.45.2 | DB access; `db.batch()` gives atomic multi-statement on neon-http | Already installed; `db.batch()` is the ONLY atomic primitive available on `neon-http` |
| `@neondatabase/serverless` | 1.0.2 | Underlying HTTP client; `sql.transaction([...])` is what Drizzle's `batch()` dispatches to | Already installed |
| `next-auth` | 5.0.0-beta.30 | Existing admin auth via `requireAdmin()` | Already installed; reuse `src/lib/auth/admin-check.ts` verbatim |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tsx` (dev) | 4.21.0 | Script runner (if a CLI verifier is ever needed) | Unlikely needed — all work happens through the UI |
| `vitest` (dev) | 4.1.4 | Unit tests for parser/enrichment/replaceAllCards | Wave 0 — add new test files |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `db.batch()` on `neon-http` | Switch this single route to `drizzle-orm/neon-serverless` (WebSocket) + `Pool`/`Client` for real `db.transaction()` | Adds a second driver, WebSocket sockets must live entirely inside one request on Vercel, more complexity. `batch()` gives the same atomicity with zero extra wiring. **REJECTED** for this phase. |
| NDJSON streaming | Server-Sent Events (`text/event-stream`) | SSE adds `EventSource` API and a dedicated parser client-side. NDJSON is just `response.body.getReader()` + `TextDecoder` + split on `\n`. Same streaming semantics; less code. **NDJSON WINS.** |
| NDJSON streaming | Polling `/api/admin/import/progress` against an in-memory `Map<token, {done,total}>` | Serverless functions do NOT share memory across invocations on Vercel. Two POST invocations to the same region may land on different instances. **REJECTED** — unreliable. |
| NDJSON streaming | Single POST returns only the final preview, no live counter | Possible, but sacrifices D-09. Not terrible for ~150 cards cache-hot (sub-second total), but painful on first import (100ms × 150 = 15s with no feedback). **REJECTED** — D-09 asks for live counter. |
| Token-based preview handoff (server holds enriched cards in memory, client POSTs only a token) | Client holds the enriched payload and posts it to `/commit` | ~150 cards × ~500 bytes JSON ≈ 75KB — well under any practical limit. Serverless memory is not shared, so a token map doesn't survive cold starts or horizontal scaling. **CLIENT-HOLDS-PAYLOAD WINS.** |

**Installation:** No new dependencies. Everything needed is already in `package.json`.

**Version verification:** All four critical libraries verified against `node_modules/*/package.json` on 2026-04-19.

## Architecture Patterns

### Recommended File Structure
```
src/
├── app/
│   ├── admin/
│   │   ├── _components/
│   │   │   ├── action-bar.tsx          # MODIFY: add "Import CSV" link button
│   │   │   └── toast.tsx               # REUSE
│   │   └── import/
│   │       ├── page.tsx                # NEW: server component, requireAdmin gate + renders client
│   │       ├── _components/
│   │       │   ├── import-client.tsx   # NEW: top-level client orchestrator (upload → preview → confirm)
│   │       │   ├── drop-zone.tsx       # NEW: drag-drop + click-to-browse
│   │       │   ├── progress-bar.tsx    # NEW: "X / Y cards enriched"
│   │       │   └── preview-panel.tsx   # NEW: summary + sample + skipped rows
│   │       └── layout.tsx              # OPTIONAL: not strictly needed
│   └── api/
│       └── admin/
│           └── import/
│               ├── preview/
│               │   └── route.ts        # NEW: POST multipart → stream NDJSON
│               └── commit/
│                   └── route.ts        # NEW: POST JSON → db.batch → JSON result
├── lib/
│   ├── csv-parser.ts                   # MODIFY: export parseManaboxCsvContent(content: string)
│   └── enrichment.ts                   # MODIFY: enrichCards(cards, opts?: { onProgress?: (done,total)=>void })
├── db/
│   └── queries.ts                      # MODIFY: add replaceAllCards(cards: Card[])
└── app/
    └── cart/
        └── cart-page-client.tsx        # PATCH (D-13): silently drop unknown IDs from localStorage
```

### Pattern 1: Streaming NDJSON from a Route Handler (recommended for D-09)

**What:** Preview endpoint returns a `Response` whose body is a `ReadableStream` that emits newline-delimited JSON messages as enrichment progresses, then a final message with the full preview payload.

**Why it fits Vercel + Next.js 16:**
- Works in the `nodejs` runtime (default) without any Vercel adapter flags. Streaming is listed as explicitly supported in `node_modules/next/dist/docs/01-app/02-guides/streaming.md` under "Streaming in Route Handlers" and "Platform support — Node.js server: Yes; Vercel supports streaming natively" (from the guide).
- No shared state — all progress lives inside the single POST invocation. Zero dependency on memory or multi-instance coordination.
- Backpressure is handled by React's fetch reader naturally.

**Message schema (Claude's discretion — proposed):**
```jsonc
// Each line is a self-contained JSON object, separated by \n
{"type":"progress","done":0,"total":143}
{"type":"progress","done":25,"total":143}
{"type":"progress","done":143,"total":143}
{"type":"result","preview":{"toImport":143,"skipped":4,"missingPrices":2,"sample":[...],"skippedRows":[...],"cards":[<full enriched Card[]>]}}
// on failure instead of "result":
{"type":"error","message":"Scryfall API unavailable after 3 retries"}
```

**Skeleton (for planner to elaborate into task actions):**
```typescript
// src/app/api/admin/import/preview/route.ts
import { requireAdmin } from "@/lib/auth/admin-check";
import { parseManaboxCsvContent } from "@/lib/csv-parser";
import { enrichCards } from "@/lib/enrichment";

export const runtime = "nodejs";
// D-10: Scryfall first-import ~150 cards × 100ms/card ≈ 15s; 300s ceiling covers slow connections
export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return Response.json({ error: "File must be .csv" }, { status: 400 });
  }

  const content = await file.text();
  const parsed = parseManaboxCsvContent(content); // { cards, skippedRows }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      try {
        send({ type: "progress", done: 0, total: parsed.cards.length });
        const { cards: enriched, stats, scryfallMisses } = await enrichCards(parsed.cards, {
          onProgress: (done, total) => send({ type: "progress", done, total }),
        });
        send({
          type: "result",
          preview: {
            toImport: enriched.length,
            parseSkipped: parsed.skippedRows.length,
            scryfallSkipped: scryfallMisses.length,
            missingPrices: stats.missingPrices,
            sample: enriched.slice(0, 20),
            skippedRows: [...parsed.skippedRows, ...scryfallMisses],
            cards: enriched,
          },
        });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Unknown error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
      // Defense against Nginx-style buffering if ever behind a reverse proxy
      "X-Accel-Buffering": "no",
    },
  });
}
```

**Client consumer (shape, not full code):**
```typescript
const res = await fetch("/api/admin/import/preview", { method: "POST", body: formData });
const reader = res.body!.getReader();
const decoder = new TextDecoder();
let buf = "";
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";
  for (const line of lines) {
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.type === "progress") setProgress(msg); // {done, total}
    else if (msg.type === "result") setPreview(msg.preview);
    else if (msg.type === "error") setError(msg.message);
  }
}
```

### Pattern 2: Atomic bulk replace using `db.batch()` (CSV-01)

**What:** Replace `db.transaction(...)` — which doesn't work on `neon-http` — with `db.batch([deleteAll, insert1, insert2, ...])`. Drizzle dispatches this as a single Neon HTTP batched-transaction request; Neon runs all statements in a single non-interactive server-side transaction, committing only if every statement succeeds.

**Why:**
- `node_modules/drizzle-orm/neon-http/session.js:151-152` literally throws `"No transactions support in neon-http driver"` when you call `db.transaction()`.
- `node_modules/drizzle-orm/neon-http/session.js:117-133` implements `batch()` by calling `this.client.transaction(builtQueries, queryConfig)` — that's Neon's native HTTP-transaction API (see `node_modules/@neondatabase/serverless/README.md:108-125`).
- Drizzle documentation (verified via web fetch): "If any statement fails, the entire transaction rolls back and no changes are applied."

**Why NOT a single INSERT with many VALUES:** Drizzle's `db.insert(cards).values(arrayOfCards)` already emits a single multi-row `INSERT` statement, so the batch is just two statements: `[deleteAll, insertAll]`. No N+1.

**Skeleton for `replaceAllCards`:**
```typescript
// src/db/queries.ts — additions
import { db } from "@/db/client";
import { cards } from "@/db/schema";
import type { Card } from "@/lib/types";

/**
 * Atomic destructive replace of the entire cards table.
 * Uses db.batch() because drizzle-orm/neon-http does not support db.transaction().
 * Neon processes the batch as a single non-interactive server-side transaction;
 * all-or-nothing semantics.
 */
export async function replaceAllCards(newCards: Card[]): Promise<{ inserted: number }> {
  if (newCards.length === 0) {
    // Still atomic: a batch of one DELETE is valid
    await db.batch([db.delete(cards)]);
    return { inserted: 0 };
  }
  const rows = newCards.map(cardToRow); // reuse seed.ts's cardToRow (dollars -> cents)
  await db.batch([
    db.delete(cards),
    db.insert(cards).values(rows),
  ]);
  return { inserted: rows.length };
}
```

**Note:** `cardToRow` currently lives in `src/db/seed.ts`. The planner should either export it from `seed.ts` and import into `queries.ts`, OR move it to a small shared module (e.g. `src/db/row-mappers.ts`). Do NOT duplicate it.

### Pattern 3: CSV parser content-based entry point

**What:** Existing `parseAllCsvFiles(dir)` reads from filesystem; the new function parses a single in-memory string using the same PapaParse logic and the same row-to-Card mapping. Returns both the valid cards AND the skipped-row detail list so the preview can show row numbers and reasons (for D-05 zone 3).

**Proposed signature:**
```typescript
// src/lib/csv-parser.ts — additions

export interface SkippedRow {
  rowNumber: number;        // 1-indexed row number in the uploaded file
  reason: string;           // e.g., "missing Set code"
  name?: string;            // best-effort identifier
}

export interface ParseResult {
  cards: Card[];
  skippedRows: SkippedRow[];
}

/** Parse Manabox CSV content from a string. Used by the admin import Route Handler. */
export function parseManaboxCsvContent(content: string): ParseResult { ... }
```

The existing `parseSingleCsv` in `csv-parser.ts` silently `continue`s on bad rows; the new function must RECORD each skip with row number and reason. Keep the existing file-based functions intact — they are still used by tests.

### Pattern 4: Enrichment progress callback

**What:** Add an optional `onProgress(done, total)` parameter to `enrichCards()`. Currently the only progress signal is a `console.log` every 25 cards, which is useless to a web UI.

**Proposed signature:**
```typescript
// src/lib/enrichment.ts — modified

export interface SkippedCard {
  setCode: string;
  collectorNumber: string;
  name: string;
  reason: string; // "Not found on Scryfall"
}

export interface EnrichmentResult {
  cards: Card[];
  stats: EnrichmentStats;
  scryfallMisses: SkippedCard[];  // NEW — for D-05 zone 3
}

export interface EnrichmentOptions {
  onProgress?: (done: number, total: number) => void;
}

export async function enrichCards(
  cards: Card[],
  opts: EnrichmentOptions = {},
): Promise<EnrichmentResult> {
  // emit onProgress(i+1, cards.length) after each fetchCard
  // push into scryfallMisses when fetchCard returns null
  ...
}
```

Backward compatibility: all existing callers pass only the first argument, so the optional second parameter doesn't break anything. The added `scryfallMisses` field also doesn't break existing callers (they just don't read it).

### Anti-Patterns to Avoid
- **`db.transaction(...)` on neon-http.** Throws at runtime. Use `db.batch([...])` instead.
- **Per-row inserts in a loop without batching.** Every `.insert()` is a separate HTTP round trip on neon-http; 150 inserts × ~50ms = 7.5s and non-atomic. Use `db.insert(cards).values(arrayOfRows)` inside the batch.
- **Holding enriched cards in server memory keyed by a token.** Serverless memory does NOT survive between requests on Vercel. The preview and commit are two separate invocations.
- **Using Server Actions for the upload.** D-08/D-09 need progress streaming inside the handler; Server Actions wrap FormData well but do not give you the streaming response primitive. Stick with Route Handlers.
- **Setting `runtime = "edge"` on the preview handler.** The enrichment step uses the filesystem cache (`src/lib/cache.ts` uses `node:fs`). Edge runtime has no `fs`. Stay on `nodejs` (the default).
- **Forgetting `Cache-Control: no-store` on the streaming response.** Prevents any CDN from buffering chunks.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parse multipart/form-data | Custom boundary parser | `await request.formData()` + `formData.get("file") as File` | Web standard, built into Next.js 16 Route Handlers — verified in route.md §"Request Body FormData" |
| Parse CSV | String splitting on `,` and `\n` | PapaParse (already in `csv-parser.ts`) | Handles quoted commas, CRLF, escaped quotes. Known-good — used in Phase 1. |
| Atomic multi-statement DB write | Manual `BEGIN; ...; COMMIT;` over raw SQL | `db.batch([...])` | Neon HTTP batches map to server-side transactions automatically; Drizzle handles the plumbing. |
| Live progress reporting | Polling endpoint + in-memory `Map<token, progress>` | Stream NDJSON in the same response | Serverless memory is not shared. One request = one stream, end-to-end reliable. |
| File-input drag-drop | Full custom drag/drop state machine | Native HTML `<input type="file" accept=".csv">` augmented with `onDragOver`/`onDragLeave`/`onDrop` on a wrapping div that forwards the file to the input | Keeps accessibility (keyboard, screen reader) intact. Only ~30 lines of client code. |
| Condition normalization | Write new mapping | Reuse `src/lib/condition-map.ts` | Already maps DB ↔ abbreviation; Manabox CSV's `Condition` column already arrives as DB-shaped string (`near_mint`) based on Phase 1 parser assumptions |
| Rate-limited Scryfall fetch | Write new throttler | Reuse `src/lib/scryfall.ts` `fetchCard()` | Already has 100ms throttle + 24h cache |

**Key insight:** The existing Phase 1 / Phase 6 code base already has a complete, battle-tested pipeline — CSV parse, condition normalize, Scryfall enrich with rate limit and cache, cards-to-rows mapper. This phase is plumbing: a Route Handler that wires those pieces to multipart upload in, atomic write out, and live progress in between. Resist any urge to re-implement.

## Runtime State Inventory

N/A — this phase does not rename or refactor anything. It adds new files/functions and modifies three existing ones (`csv-parser.ts`, `enrichment.ts`, `queries.ts`) in backward-compatible ways. No DB schema migration. No renamed env vars. No stored identifiers changing.

**Verified:**
- Stored data: `cards` table schema unchanged; only the row contents will be replaced destructively by this feature when the admin uses it. Non-code runtime state (Scryfall cache) is content-addressed by `setCode-collectorNumber` and remains valid across imports.
- Live service config: None touched.
- OS-registered state: None.
- Secrets / env vars: None added or renamed. `DATABASE_URL` already present.
- Build artifacts: None affected.

## Common Pitfalls

### Pitfall 1: `db.transaction()` throwing at runtime
**What goes wrong:** Plan calls for `db.transaction(async tx => { ... })`; Vitest and production both throw `Error: No transactions support in neon-http driver` the first time the code runs.
**Why it happens:** Drizzle's `neon-http` driver (unlike `neon-serverless`, `node-postgres`, `postgres-js`) intentionally does not support interactive transactions — HTTP is stateless.
**How to avoid:** Use `db.batch([...])` as shown in Pattern 2. If a future feature genuinely needs an interactive transaction (read-then-conditional-write-in-one-atomic-unit), then and only then consider adding `drizzle-orm/neon-serverless` as a second driver for that specific use case.
**Warning signs:** Seeing `import { drizzle } from "drizzle-orm/neon-http"` combined with `db.transaction(`. Grep for this.

### Pitfall 2: Vercel streaming gets buffered by a proxy
**What goes wrong:** The live `X / Y enriched` counter only appears once, at the end, as if the server was not streaming.
**Why it happens:** Some reverse proxies (Nginx) buffer whole responses. Gzip compression can also buffer chunks until enough bytes are collected to compress efficiently. See `node_modules/next/dist/docs/01-app/02-guides/streaming.md` §"What can affect streaming".
**How to avoid:** Set `X-Accel-Buffering: no` and `Cache-Control: no-store` headers on the streamed response. Vercel's platform supports streaming natively (same docs, "Platform support — Vercel: Yes"); the project has no custom `next.config.ts` headers that would interfere. Still, belt and suspenders — set both headers.
**Warning signs:** In `curl -N`, chunks arrive all at once at the end. In the browser, the progress number jumps from 0 to 150 with no intermediate values.

### Pitfall 3: Forgetting `maxDuration` → 504 at ~10s on Vercel Pro
**What goes wrong:** First-ever import of a brand-new binder with 150 uncached cards takes 15-20 seconds; Vercel kills the function at the default 10s (Hobby) or 60s (some Pro) ceiling and returns `FUNCTION_INVOCATION_TIMEOUT`.
**Why it happens:** Scryfall enrichment is 100ms/card × 150 = 15s minimum. Without explicit `maxDuration`, the function inherits the platform default, which varies.
**How to avoid:** D-10 already mandates `export const maxDuration = 300` on the preview Route Handler. Make it one of the first lines in the file, with a comment explaining WHY (first-import cost + 100ms Scryfall rate limit).
**Warning signs:** Intermittent 504s on first import of a new binder; never happens on re-import (because of the 24h cache).

### Pitfall 4: Scryfall 429 mid-enrichment corrupts the preview
**What goes wrong:** Enrichment succeeds for cards 1-83, Scryfall returns 429 for cards 84+, the current `fetchCard()` logs a warning and returns `null`, so ~70 legitimate cards get reported as "not found on Scryfall" — and the admin commits the import thinking those rows are genuinely unknown.
**Why it happens:** `src/lib/scryfall.ts` treats all non-200 responses as misses, no distinction between "genuinely not on Scryfall" (404) and "Scryfall throttling" (429).
**How to avoid:** This is flagged as Claude's Discretion in CONTEXT.md. The pragmatic recommendation (to codify in the plan): for 429 responses, retry with exponential backoff (e.g. wait 500ms, 1s, 2s — three attempts) before falling back to null. The existing 100ms rate limit makes 429s unlikely, so this is a defence-in-depth measure.
**Warning signs:** An unexpected cluster of "not found on Scryfall" in the skipped section, all in a row.

### Pitfall 5: File lookup error on `formData.get("file")`
**What goes wrong:** `formData.get("file")` returns `null` because the client form field uses a different name (e.g., the `<input>` has `name="upload"` but the handler looks for `"file"`).
**Why it happens:** The multipart field name is implicit glue; nothing in TypeScript catches the mismatch.
**How to avoid:** Define the field name as a constant shared by client and server (e.g., `export const IMPORT_FILE_FIELD = "file"`). Alternatively, document it in one place.
**Warning signs:** 400 "No file uploaded" response even though the user clearly attached a file.

### Pitfall 6: Cart page doesn't silently drop unknown IDs (D-13)
**What goes wrong:** After an import, an existing buyer's cart contains IDs that no longer exist in the DB. The cart page renders each as a red "No longer available" block (current `cart-item.tsx` behaviour, verified by reading `src/components/cart-item.tsx:45-76`). D-13 asks for SILENT drop — no visible block.
**Why it happens:** The current Phase 4 cart gracefully handles missing cards for resilience, but that's a "soft warning" UX, not silent.
**How to avoid:** In `src/app/cart/cart-page-client.tsx`, add a `useEffect` that, after hydration, iterates the cart's `items` Map and calls `removeItem(cardId)` for any id NOT present in `cardMap`. This reconciles localStorage against DB silently, as D-13 requires. Small patch (~10 lines); do it in Phase 10.
**Warning signs:** After import, buyer sees "No longer available" blocks. Should not happen per D-13.

### Pitfall 7: Uploading a non-Manabox CSV produces 0 cards and the preview UI is confusing
**What goes wrong:** Admin uploads a random CSV; parser tolerates every row (wrong headers → no valid cards); preview shows "0 cards will be imported, 143 skipped". Admin clicks Confirm anyway and wipes the inventory.
**Why it happens:** D-12's safeguard is the delta in the button label — "replace 136 cards with 0 new cards" — which DOES surface the problem. But the "Confirm import" button should arguably still be clickable only if `toImport > 0`.
**How to avoid:** Claude's Discretion flagged the zero-valid-rows case. Recommendation for the plan: if `toImport === 0`, the preview panel shows the skipped rows and an error banner ("No valid cards parsed — check that this is a Manabox export"), and the "Confirm import" button is DISABLED. User must click "Cancel" to start over.
**Warning signs:** QA test plan should include uploading a CSV with wrong headers and verifying confirm is disabled.

## Code Examples

### CSV upload client (drag-drop wrapping a native file input)
```tsx
// Shape only — styling per CONTEXT.md (dashed border) is Claude's discretion
"use client";
import { useState, useRef } from "react";

export function DropZone({ onFile }: { onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handle(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      alert("File must be .csv");
      return;
    }
    onFile(file);
  }

  return (
    <div
      className={`border-2 border-dashed rounded-md p-8 text-center ${isDragging ? "border-accent bg-accent-light" : "border-zinc-300 dark:border-zinc-700"}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        handle(e.dataTransfer.files?.[0]);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
    >
      <p>Drop a Manabox CSV here or click to browse</p>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0])}
      />
    </div>
  );
}
```

### NDJSON stream reader (client)
```ts
// Source pattern: node_modules/next/dist/docs/01-app/02-guides/streaming.md §"Observe raw chunks"
async function streamPreview(file: File, onProgress: (done: number, total: number) => void) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/admin/import/preview", { method: "POST", body: formData });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let preview: PreviewPayload | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.type === "progress") onProgress(msg.done, msg.total);
      else if (msg.type === "result") preview = msg.preview;
      else if (msg.type === "error") throw new Error(msg.message);
    }
  }
  if (!preview) throw new Error("Stream ended without preview");
  return preview;
}
```

### Commit endpoint (atomic DB replace)
```typescript
// src/app/api/admin/import/commit/route.ts
import { requireAdmin } from "@/lib/auth/admin-check";
import { replaceAllCards } from "@/db/queries";
import type { Card } from "@/lib/types";

export const runtime = "nodejs";
// Commit is fast — only DB round trips, no network to Scryfall
export const maxDuration = 30;

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  let body: { cards: Card[] };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!Array.isArray(body.cards)) {
    return Response.json({ error: "Missing cards array" }, { status: 400 });
  }

  try {
    const { inserted } = await replaceAllCards(body.cards);
    return Response.json({ success: true, inserted });
  } catch (err) {
    console.error("[IMPORT COMMIT] atomic replace failed:", err);
    return Response.json(
      { error: "Import failed — inventory unchanged" },
      { status: 500 },
    );
  }
}
```

### Cart reconciliation patch (D-13)
```tsx
// src/app/cart/cart-page-client.tsx — add near the existing hydration useEffect
useEffect(() => {
  if (!hydrated) return;
  // Silently drop any cart IDs no longer present in current inventory (D-13).
  for (const [cardId] of items) {
    if (!cardMap.has(cardId)) removeItem(cardId);
  }
}, [hydrated, items, cardMap, removeItem]);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `db.transaction()` on any Drizzle driver | On `neon-http`, use `db.batch([...])`; real transactions only on `neon-serverless` / `node-postgres` | Drizzle 0.29+ / Neon HTTP launch | CSV-01's "single transaction" must be implemented via `batch()` |
| Server-Sent Events for progress | NDJSON over `fetch` + `ReadableStream.getReader()` | Whatwg streams GA | Less ceremony, no `EventSource` reconnect semantics needed for a one-shot progress stream |
| `middleware.ts` | `proxy.ts` (Next.js 16 rename) | Next.js 16 | Already done in this codebase; no action needed |
| `params`/`searchParams` synchronous | Async Promises in Next.js 16 | Next.js 16 | No impact — new routes have no dynamic params |
| `next lint` | ESLint CLI directly | Next.js 16 | Not relevant to this phase |

**Deprecated/outdated:**
- `bodyParser` config (Pages Router only — not applicable here).
- `api` routes under `pages/api` — this codebase is fully App Router.

## Open Questions

1. **Should preview display set names in the "skipped rows" zone, or just set codes?**
   - What we know: Manabox CSV has `Set code` and `Set name` columns; we read both. Scryfall misses (fetched by setCode+collectorNumber) obviously have the Manabox-supplied name.
   - What's unclear: UI density.
   - Recommendation: Use "Name (set_code-collector)" — e.g., "Black Lotus (lea-232)". Matches how Phase 1's seed logs identify cards.

2. **What happens if the admin uploads a ZIP or xlsx?**
   - What we know: D-04 says "reject if not `.csv` extension".
   - What's unclear: Should we also check MIME type?
   - Recommendation: Extension check is sufficient for a single-admin OAuth-gated store. Adding MIME sniffing is over-engineering. D-04 stands.

3. **Should `replaceAllCards([])` be allowed (i.e., admin imports an empty CSV)?**
   - What we know: Silently wiping all inventory would be surprising.
   - What's unclear: Do we block at the UI (Pitfall 7's "disable confirm when toImport === 0") or at the API layer?
   - Recommendation: Block at UI (simpler UX, better error message). The API layer can still accept an empty array (preserves single code path) but the UI should never send one.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js runtime | Route Handlers + `fs` cache | ✓ | 20+ (Next.js 16 requires 20.9+) | — |
| Neon Postgres (DATABASE_URL) | `db.batch()` | ✓ (already provisioned per Phase 6) | — | — |
| Scryfall API (network) | `fetchCard()` | ✓ (public internet) | — | If unreachable: existing code returns `null`, reporting as "not found" — acceptable degraded mode |
| `drizzle-orm/neon-http` | Bulk atomic replace | ✓ | 0.45.2 | — |
| `@neondatabase/serverless` | Transport for batch | ✓ | 1.0.2 | — |
| `papaparse` | CSV parsing | ✓ | 5.5.3 | — |
| Vercel Pro plan (for maxDuration=300) | First-import 15s+ duration | Assumed ✓ (prior phases deployed to Vercel) | — | Hobby plan caps at 10s → would need chunking; out of scope |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 (installed, `vitest.config.ts` already present) |
| Config file | `vitest.config.ts` — includes `src/**/__tests__/**/*.test.ts`, env `node`, `@` → `./src` alias |
| Quick run command | `npx vitest run src/lib/__tests__/csv-parser.test.ts` (per file) |
| Full suite command | `npx vitest run` |
| Known gap | `package.json` has NO `test` script. Add `"test": "vitest run"` as a Wave 0 task for ergonomics. |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| CSV-01 | `replaceAllCards(cards)` issues a single atomic batch [delete, insert] | unit | `npx vitest run src/db/__tests__/replace-all-cards.test.ts` | ❌ Wave 0 |
| CSV-01 | `replaceAllCards(cards)` rolls back on insert failure (mocked) | unit | same file | ❌ Wave 0 |
| CSV-01 | `replaceAllCards([])` deletes all rows | unit | same file | ❌ Wave 0 |
| CSV-02 | `parseManaboxCsvContent(validCsv)` returns cards + empty skippedRows | unit | `npx vitest run src/lib/__tests__/csv-parser-content.test.ts` | ❌ Wave 0 |
| CSV-02 | `parseManaboxCsvContent(csvWithBadRows)` skips and records each bad row with row number + reason | unit | same file | ❌ Wave 0 |
| CSV-02 | `enrichCards(cards, { onProgress })` invokes `onProgress(i, total)` exactly `cards.length` times in order | unit | `npx vitest run src/lib/__tests__/enrichment-progress.test.ts` | ❌ Wave 0 |
| CSV-02 | `enrichCards` populates `scryfallMisses[]` when `fetchCard` returns null | unit | same file | ❌ Wave 0 |
| CSV-01 | `/api/admin/import/preview` returns 401 without admin session | unit (auth-integrated, mock `requireAdmin`) | `npx vitest run src/app/api/admin/import/__tests__/preview.test.ts` | ❌ Wave 0 |
| CSV-01 | `/api/admin/import/preview` rejects non-.csv files with 400 | same | same | ❌ Wave 0 |
| CSV-01 | `/api/admin/import/preview` streams NDJSON with progress and result messages | same | same | ❌ Wave 0 |
| CSV-01 | `/api/admin/import/commit` rejects unauthenticated POST | same | `npx vitest run src/app/api/admin/import/__tests__/commit.test.ts` | ❌ Wave 0 |
| CSV-01 | `/api/admin/import/commit` rejects missing `cards` array | same | same | ❌ Wave 0 |
| CSV-02 | Preview UI displays summary counts, sample, skipped-rows expander | manual-only (smoke) | documented in VALIDATION.md — browser visit to `/admin/import` after `pnpm dev` | — |
| D-13 | After import, stale cart items are silently removed (no "No longer available" block) | integration (component test, or manual-only) | `npx vitest run src/app/cart/__tests__/cart-page-client.test.tsx` OR manual | ❌ Wave 0 (optional — manual smoke also acceptable) |
| D-15 | Post-commit redirect to `/admin` with toast "Imported N cards (M skipped)" | manual-only (smoke) | documented in VALIDATION.md | — |
| D-16 | Storefront reflects new inventory immediately after import | manual-only (smoke) | documented in VALIDATION.md — visit `/` after import, verify new cards present | — |

### Sampling Rate
- **Per task commit:** `npx vitest run <path-of-file-just-touched>` (< 2s)
- **Per wave merge:** `npx vitest run` (full suite, < 10s at current project size)
- **Phase gate:** Full suite green + manual smoke plan executed before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Add `"test": "vitest run"` script to `package.json`
- [ ] `src/db/__tests__/replace-all-cards.test.ts` — covers CSV-01 atomicity with mocked `db.batch()`
- [ ] `src/lib/__tests__/csv-parser-content.test.ts` — covers CSV-02 parse-skip accuracy
- [ ] `src/lib/__tests__/enrichment-progress.test.ts` — covers D-09 progress callback + CSV-02 Scryfall misses
- [ ] `src/app/api/admin/import/__tests__/preview.test.ts` — covers Route Handler auth, validation, NDJSON streaming
- [ ] `src/app/api/admin/import/__tests__/commit.test.ts` — covers Route Handler auth, validation, `replaceAllCards` invocation
- [ ] (Optional) `src/app/cart/__tests__/cart-page-client.test.tsx` — covers D-13 silent drop

*(No new framework install needed — Vitest is present.)*

## Sources

### Primary (HIGH confidence — from installed `node_modules`)
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` — Route Handler HTTP methods, `request.formData()`, streaming with `ReadableStream`, no body-size cap mentioned
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md` — `maxDuration` is valid on `route.ts`, introduced v13.4.10, still present in v16
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/index.md` — version history: `dynamic`/`dynamicParams`/`revalidate`/`fetchCache` removed only when `cacheComponents` is enabled
- `node_modules/next/dist/docs/01-app/02-guides/streaming.md` — "Streaming in Route Handlers" section with exact `ReadableStream` pattern used above; platform support table lists Vercel "Yes"; anti-buffering guidance (`X-Accel-Buffering: no`)
- `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` — async request APIs, proxy rename, PPR removal, list of what IS and ISN'T a breaking change
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md` — `bodySizeLimit` is a **Server Actions** concept (default 1MB), NOT Route Handlers
- `node_modules/drizzle-orm/neon-http/session.js` — L151-152 explicit `throw new Error("No transactions support in neon-http driver")`; L117-133 `batch()` implementation routes through `client.transaction(builtQueries)`
- `node_modules/drizzle-orm/neon-http/driver.d.ts` — `batch<U extends BatchItem<'pg'>>(batch: T): Promise<BatchResponse<T>>` public API
- `node_modules/drizzle-orm/neon-http/migrator.d.ts` L6 — "The Neon HTTP driver does not support transactions" (in the migrator docstring)
- `node_modules/@neondatabase/serverless/README.md` §"transaction()" L102-125 — canonical description of Neon HTTP batch-transactions: "Multiple queries can be issued via fetch request within a single, non-interactive transaction"
- `src/lib/csv-parser.ts`, `src/lib/enrichment.ts`, `src/lib/scryfall.ts`, `src/lib/cache.ts`, `src/lib/condition-map.ts`, `src/db/queries.ts`, `src/db/schema.ts`, `src/db/seed.ts`, `src/db/client.ts`, `src/app/api/admin/cards/route.ts`, `src/app/api/admin/export/route.ts`, `src/app/admin/_components/action-bar.tsx`, `src/app/admin/_components/toast.tsx`, `src/app/admin/layout.tsx`, `src/app/cart/page.tsx`, `src/app/cart/cart-page-client.tsx`, `src/components/cart-item.tsx`, `src/lib/types.ts`, `src/lib/auth/admin-check.ts` — read directly

### Secondary (MEDIUM confidence — web sources verified against installed code)
- [Drizzle Batch API docs](https://orm.drizzle.team/docs/batch-api) — confirms atomicity of `db.batch()` on Neon HTTP; fetched 2026-04-19
- [Vercel Functions — Configuring Maximum Duration](https://vercel.com/docs/functions/configuring-functions/duration) — confirms `maxDuration = 300` valid on Pro plan for Route Handlers
- [Neon serverless driver README](https://neon.com/docs/serverless/serverless-driver) — confirms 64MB max request/response size (far above a 150-card batch insert)

### Tertiary (LOW confidence — context, not load-bearing)
- [Neon HTTP transactions feature request issue #31](https://github.com/neondatabase/serverless/issues/31) — historical context on why `neon-http` never got interactive transactions
- [Answeroverflow: Drizzle Transaction help, July 2025](https://www.answeroverflow.com/m/1395298905239064656) — community confirmation that interactive transactions require `neon-serverless` (Pool/Client)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library version verified in `node_modules/*/package.json` on this machine
- Architecture: HIGH — streaming pattern copied from Next.js 16's own installed docs; `db.batch()` atomic behaviour verified by reading Drizzle's source
- Pitfalls: HIGH — Pitfall 1 (neon-http transactions) verified by grep of installed source; Pitfall 2 (streaming buffering) verified by Next.js docs §"What can affect streaming"; Pitfall 6 (cart UX) verified by reading `src/components/cart-item.tsx`
- Code examples: HIGH — each skeleton maps directly to project idioms (existing Route Handler in `src/app/api/admin/cards/route.ts`, existing enrichment signature in `src/lib/enrichment.ts`)

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (30 days — Next.js 16 stable, Drizzle 0.45.x stable, Neon HTTP driver API stable)

---

*Phase: 10-csv-import*
*Research completed: 2026-04-19*
