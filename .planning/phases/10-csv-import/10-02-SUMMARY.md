---
phase: 10-csv-import
plan: 02
subsystem: api
tags: [route-handlers, multipart, ndjson, streaming, drizzle, neon-http, vitest]

# Dependency graph
requires:
  - phase: 10-csv-import
    provides: parseManaboxCsvContent(content) returning { cards, skippedRows } (landed 10-01)
  - phase: 10-csv-import
    provides: enrichCards(cards, { onProgress }) with scryfallMisses[] (landed 10-01)
  - phase: 10-csv-import
    provides: replaceAllCards(cards) atomic db.batch([delete, insert]) (landed 10-01)
  - phase: 08-authentication
    provides: requireAdmin() -- 401/403 Response gate for admin routes
provides:
  - POST /api/admin/import/preview -- multipart upload + NDJSON stream (progress | result | error)
  - POST /api/admin/import/commit -- JSON body { cards } -> atomic replace -> { success, inserted }
  - IMPORT_FILE_FIELD constant + NDJSON message shapes + PreviewPayload + CommitRequest/Response (src/lib/import-contract.ts)
  - maxDuration=300 on preview (D-10 Vercel Pro ceiling with rationale comment)
  - Anti-buffering headers on preview stream (Content-Type: application/x-ndjson, Cache-Control: no-store, X-Accel-Buffering: no)
affects: [10-03-admin-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Route Handler response streams: new Response(new ReadableStream<Uint8Array>({ start(controller) { ... } }), { headers })"
    - "NDJSON framing: JSON.stringify(msg) + \"\\n\" per line; TextEncoder once, TextDecoder + split('\\n') on the client"
    - "Auth gate pattern reused: const auth = await requireAdmin(); if (auth instanceof Response) return auth;"
    - "vi.hoisted() to pre-initialize mock fns used by vi.mock factories in Vitest 4 (factories are hoisted above top-level const declarations)"
    - "Mock @/db/queries WITHOUT importActual to avoid drizzle(DATABASE_URL) init at module load in node test env"
    - "Shared client<->server contract in src/lib/import-contract.ts -- single source of truth for field name + message shapes (RESEARCH Pitfall 5)"

key-files:
  created:
    - src/lib/import-contract.ts
    - src/app/api/admin/import/preview/route.ts
    - src/app/api/admin/import/commit/route.ts
    - src/app/api/admin/import/__tests__/preview.test.ts
    - src/app/api/admin/import/__tests__/commit.test.ts
    - .planning/phases/10-csv-import/10-02-SUMMARY.md
  modified: []

key-decisions:
  - "Client holds the enriched Card[] between requests (posted back to /commit) -- serverless memory is not shared across invocations; token-based handoff would require a persistent store we don't need"
  - "Preview's final NDJSON message carries the FULL cards[] (not just the 20-card sample) so /commit receives the exact payload the admin approved"
  - "Commit route short-circuits on Array.isArray(body.cards) -- rejects missing, non-object, and non-array cases with one branch; tests cover both absence and string-as-cards"
  - "maxDuration=300 on preview only; commit gets 30 (DB round-trip only) -- keeps each route sized to its actual worst case"
  - "Tests mock @/lib/csv-parser and @/lib/enrichment via vi.importActual spread so type exports remain available while the runtime call sites are stubbed"
  - "vi.hoisted() used to declare mock fn variables (Vitest 4 hoists vi.mock factories above top-level const bindings -- closures would otherwise see uninitialized bindings)"

requirements-completed: [CSV-01, CSV-02]

# Metrics
duration: 3min
completed: 2026-04-19
---

# Phase 10 Plan 02: Route Handlers Summary

**Two admin Route Handlers wired to the Wave 0 primitives: `POST /api/admin/import/preview` (multipart -> NDJSON stream of progress then final preview) and `POST /api/admin/import/commit` (JSON body -> atomic replaceAllCards). One shared contract module prevents client/server drift on the multipart field name and message shapes. 11 new tests cover auth, validation, stream shape, and replaceAllCards invocation.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-19T06:10:09Z
- **Completed:** 2026-04-19T06:13:21Z
- **Tasks:** 2
- **Files created:** 6 (3 source + 2 tests + this summary)
- **Files modified:** 0

## Accomplishments

- `POST /api/admin/import/preview` accepts `multipart/form-data` with field name `file`, validates `.csv` extension, parses with `parseManaboxCsvContent`, runs `enrichCards` while streaming `{type:"progress",done,total,stage:"enrich"}` lines, and emits exactly one `{type:"result",preview:PreviewPayload}` line. On enrichment failure it emits `{type:"error",message}` and closes the stream cleanly.
- `POST /api/admin/import/commit` accepts `{ cards: Card[] }` JSON, calls `replaceAllCards(body.cards)` once, returns `{success: true, inserted: N}`. Invalid JSON -> 400 `{error: "Invalid JSON"}`. Missing/non-array cards -> 400 `{error: "Missing cards array"}`. `replaceAllCards` rejection -> 500 `{error: "Import failed — inventory unchanged"}`.
- `src/lib/import-contract.ts` exports `IMPORT_FILE_FIELD = "file"` (the single source of truth for the multipart field name) and all the message / payload types the Phase 10-03 UI will consume verbatim.
- `maxDuration = 300` set on the preview route with a comment explaining the math (150 cards x 100ms Scryfall rate limit ≈ 15s first-import, D-10 permits 300s). Commit route uses `maxDuration = 30` since its only work is the batched DB write.
- Anti-buffering headers (RESEARCH Pitfall 2) literally present on the preview stream: `Content-Type: application/x-ndjson`, `Cache-Control: no-store`, `X-Accel-Buffering: no`.
- Tests: 11/11 green across 2 new files. Full suite: 13 files / 121 tests (up from 11/110). No regressions.

## Task Commits

1. **Task 1: Preview + commit Route Handlers + shared import-contract** -- `843f257` (feat)
2. **Task 2: Route Handler test suites (auth, validation, stream, replace)** -- `ee07837` (test)

## Route Reference (for Plan 10-03 to consume)

### POST /api/admin/import/preview
- **Content type in:** `multipart/form-data`
- **Field name:** `IMPORT_FILE_FIELD` from `@/lib/import-contract` (value: `"file"`)
- **Content type out:** `application/x-ndjson`
- **Response headers:** `Cache-Control: no-store`, `X-Accel-Buffering: no`
- **Status codes:**
  - `401 { error: "Unauthorized" }` -- no admin session (via `requireAdmin`)
  - `400 { error: "Invalid multipart body" }` -- malformed multipart
  - `400 { error: "No file uploaded" }` -- missing `file` field
  - `400 { error: "File must be .csv" }` -- wrong extension
  - `200` -- stream of NDJSON messages
- **NDJSON message schema:** See `src/lib/import-contract.ts`

### POST /api/admin/import/commit
- **Content type in:** `application/json`
- **Request body:** `CommitRequest = { cards: Card[] }`
- **Response body (200):** `CommitResponse = { success: true, inserted: number }`
- **Status codes:**
  - `401 { error: "Unauthorized" }`
  - `400 { error: "Invalid JSON" }`
  - `400 { error: "Missing cards array" }` -- field absent OR non-array
  - `200 { success: true, inserted: N }`
  - `500 { error: "Import failed — inventory unchanged" }` -- replaceAllCards rejected

## NDJSON Message Shapes

From `src/lib/import-contract.ts`:

```typescript
export interface ImportProgressMessage {
  type: "progress";
  done: number;
  total: number;
  stage?: "parse" | "enrich";
}
export interface ImportResultMessage {
  type: "result";
  preview: PreviewPayload;
}
export interface ImportErrorMessage {
  type: "error";
  message: string;
}
export type ImportStreamMessage =
  | ImportProgressMessage
  | ImportResultMessage
  | ImportErrorMessage;
```

## PreviewPayload Shape

```typescript
export interface PreviewPayload {
  toImport: number;           // enriched.length
  parseSkipped: number;       // parseResult.skippedRows.length
  scryfallSkipped: number;    // enrichment.scryfallMisses.length
  missingPrices: number;      // enrichment.stats.missingPrices
  sample: Card[];             // enriched.slice(0, 20)
  skippedRows: Array<
    | { kind: "parse"; rowNumber: number; reason: string; name?: string; setCode?: string; collectorNumber?: string }
    | { kind: "enrich"; setCode: string; collectorNumber: string; name: string; reason: string }
  >;
  cards: Card[];              // FULL enriched list -- posted back to /commit
}
```

The `skippedRows` discriminated union (`kind: "parse" | "enrich"`) lets the 10-03 preview UI render per-row entries with different icons and copy.

## Shared Constant Location (for 10-03)

```typescript
import { IMPORT_FILE_FIELD } from "@/lib/import-contract";
// ...
const formData = new FormData();
formData.append(IMPORT_FILE_FIELD, file);
```

The client MUST use this import rather than hardcoding `"file"`. Typo on either side = `formData.get(...)` returns null = `{error:"No file uploaded"}`.

## maxDuration Rationale

| Route | maxDuration | Rationale |
| ----- | ----------- | --------- |
| `preview` | 300s | D-10: first-import ~150 cards × 100ms Scryfall rate limit ≈ 15s, plus slow-connection upload headroom; 300s is Vercel Pro ceiling. Subsequent imports hit 24h cache and return sub-second. |
| `commit` | 30s | DB-only; one batched `DELETE; INSERT ... VALUES (...)` via `db.batch()`. 30s is generous headroom for Neon cold starts; real work ≪ 1s. |

## Test Counts and Commands

| File | Tests | Command |
| ---- | ----- | ------- |
| `src/app/api/admin/import/__tests__/preview.test.ts` | 5 | `npx vitest run src/app/api/admin/import/__tests__/preview.test.ts` |
| `src/app/api/admin/import/__tests__/commit.test.ts` | 6 | `npx vitest run src/app/api/admin/import/__tests__/commit.test.ts` |
| **Full suite** | **121 across 13 files** | `npm test` (runs `vitest run`) |

Pre-plan baseline: 11 files / 110 tests. Post-plan: **13 files / 121 tests**. Delta: **+2 files, +11 tests, 0 regressions.**

## Files Created

- **`src/lib/import-contract.ts`** (94 lines) -- `IMPORT_FILE_FIELD`, `ImportProgressMessage`, `ImportResultMessage`, `ImportErrorMessage`, `ImportStreamMessage`, `PreviewPayload`, `CommitRequest`, `CommitResponse`.
- **`src/app/api/admin/import/preview/route.ts`** (110 lines) -- multipart -> parse -> enrich with progress callback -> NDJSON stream. `export const runtime = "nodejs"`, `export const maxDuration = 300`.
- **`src/app/api/admin/import/commit/route.ts`** (36 lines) -- JSON -> `replaceAllCards` -> `{success, inserted}`. `export const runtime = "nodejs"`, `export const maxDuration = 30`.
- **`src/app/api/admin/import/__tests__/preview.test.ts`** (189 lines, 5 tests) -- auth, no-file, non-csv, NDJSON stream shape + anti-buffering headers, enrichCards throw.
- **`src/app/api/admin/import/__tests__/commit.test.ts`** (103 lines, 6 tests) -- auth, invalid JSON, missing cards, non-array cards, 200 + replaceAllCards-called-once-with-body.cards, 500 on reject.

## Decisions Made

- **`vi.hoisted()` for mock fn declarations.** Vitest 4 hoists `vi.mock(...)` factories to the top of the file; if the factory closes over top-level `const x = vi.fn()` it reads an uninitialized binding at mock-eval time. `vi.hoisted()` runs at the same priority as the mocks, so the bindings exist when the factories run. This is the idiomatic fix per the Vitest 4 docs.
- **No `importActual` on `@/db/queries` in commit.test.ts.** `@/db/queries` imports `@/db/client`, which calls `drizzle(process.env.DATABASE_URL!)` at module load. Without a DATABASE_URL in the node test env, that throws. Since the commit route only consumes `replaceAllCards`, a thin `{ replaceAllCards: replaceAllCardsMock }` mock suffices; no need to bring the real module along. This was flagged by the plan's own action notes ("no DATABASE_URL needed").
- **Preview test uses `importActual` for `@/lib/csv-parser` and `@/lib/enrichment`** -- neither of those modules instantiates DB clients at load; keeping the real type exports around simplifies test setup.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] Vitest 4 hoists `vi.mock` factories above top-level `const` bindings**

- **Found during:** Task 2, first run of the new test files
- **Issue:** Plan-provided test code declared `const requireAdminMock = vi.fn();` at top level and then used that binding inside the `vi.mock(...)` factory. Vitest 4 hoists the factory above the const declaration, causing `ReferenceError: Cannot access 'requireAdminMock' before initialization` and producing 0 tests from both files.
- **Fix:** Wrap the mock fn declarations in `vi.hoisted(() => ({ requireAdminMock: vi.fn(), ... }))` so the bindings exist when the hoisted factory runs. Added short comments pointing to the Vitest docs.
- **Files modified:** `src/app/api/admin/import/__tests__/preview.test.ts`, `src/app/api/admin/import/__tests__/commit.test.ts`
- **Commit:** `ee07837` (both fixes applied before the first passing commit)

**2. [Rule 3 - Blocking Issue] `vi.importActual("@/db/queries")` triggers drizzle init without DATABASE_URL**

- **Found during:** Task 2, second test run (commit.test.ts still failing after fix #1)
- **Issue:** `@/db/queries` imports `@/db/client`, which calls `drizzle(DATABASE_URL)` at module load. In the node test environment, `DATABASE_URL` is undefined; `drizzle()` throws `TypeError: Cannot read properties of undefined (reading 'query')`. The plan's acceptance criterion literally states "Neither test file imports from @/db/client directly (they mock @/db/queries.replaceAllCards at a higher level so no DATABASE_URL needed)". Using `importActual` defeats that.
- **Fix:** Replace `vi.mock("@/db/queries", async () => { const actual = await vi.importActual(...); return { ...actual, replaceAllCards: replaceAllCardsMock }; })` with `vi.mock("@/db/queries", () => ({ replaceAllCards: replaceAllCardsMock }))`. The commit route only uses `replaceAllCards`; we don't need any other exports. Added an explanatory comment.
- **Files modified:** `src/app/api/admin/import/__tests__/commit.test.ts`
- **Commit:** `ee07837` (same commit as fix #1)

Both fixes were corrective adjustments to the plan-provided test scaffolding to match Vitest 4's hoisting semantics and this project's lazy DB-client initialization. No production code behavior changed.

## Issues Encountered

None beyond the two test-scaffolding fixes documented above, both of which resolved before any task was committed.

## Confirmations (plan output spec)

- **`grep -F "maxDuration = 300" src/app/api/admin/import/preview/route.ts`** -- 1 match (line 17).
- **`grep -F "application/x-ndjson" src/app/api/admin/import/preview/route.ts`** -- 1 match.
- **`grep -F "replaceAllCards(body.cards)" src/app/api/admin/import/commit/route.ts`** -- 1 match (line 26).
- **`grep -RF "db.transaction(" src/app/api/admin/import/`** -- 0 matches.
- **`grep -F "IMPORT_FILE_FIELD = \"file\"" src/lib/import-contract.ts`** -- 1 match (line 11).
- **`npx tsc --noEmit`** -- no errors introduced.
- **`npx vitest run`** -- 13 test files / 121 tests / all green.

## User Setup Required

None. No external service config; no env vars changed; no dependencies added.

## Next Phase Readiness

- **10-03 (Admin UI)** can `import { IMPORT_FILE_FIELD, type ImportStreamMessage, type PreviewPayload } from "@/lib/import-contract"` and wire the client to both routes with zero guesswork. The NDJSON reader pattern is shown verbatim in `RESEARCH.md` Pattern 1.
- **Routes are fully exercised by unit tests** -- auth gate, validation, stream shape, and `replaceAllCards` invocation are all pinned. The 10-03 client can be developed against the contract types without needing a live DB or Scryfall to prove correctness.
- No blockers; no concerns.

## Self-Check: PASSED

All 6 created files verified on disk. Both task commits (`843f257`, `ee07837`) verified in git log. `npx vitest run` confirmed green (13 files / 121 tests). No new TypeScript errors.

---
*Phase: 10-csv-import*
*Completed: 2026-04-19*
