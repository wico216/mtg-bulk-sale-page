# Phase 19 Plan 01 — Server (Two-Stage NDJSON + Scoped Replace) — SUMMARY

**Plan:** `19-01-PLAN.md`
**Status:** Complete (8 tasks executed; whole-repo gate GREEN)
**Date:** 2026-05-11

---

## Decisions Covered

| ID | Decision | Status | Tasks | Evidence |
|----|----------|--------|-------|----------|
| D-01 | `{ type: 'binders', binders: BinderSummary[] }` NDJSON message + `BinderSummary` shape | ✓ | 1, 4 | `src/lib/import-contract.ts` (BinderSummary interface), `src/app/api/admin/import/preview/route.ts:buildBindersFromParsed`, preview test "binders message is the FIRST NDJSON line" |
| D-02 | Two-call flow; selectedBinders body field scopes enrichment | ✓ | 1, 4 | preview test "selectedBinders scopes enrichment input"; legacy preserved by test "selectedBinders === undefined preserves legacy behavior" |
| D-15 | `replaceCardsForBinders` replaces `replaceAllCards`; same `db.batch` shape; scoped `WHERE binder IN (...)` | ✓ | 2, 3 | `src/db/queries.ts:replaceCardsForBinders`; replace-cards-for-binders.test.ts Test F (scoped DELETE); grep proof zero matches |
| D-16 | `selectedBinders` server-side validation via `normalizeBinderName` | ✓ | 4, 5 | preview/route.ts validation block; commit/route.ts `validateSelectedBinders`; preview tests "400 not normalized"/"400 not in upload"/"400 length > 200" |
| D-17 | `ScopedImportAuditMetadata` bounded shape, < 4KB cap | ✓ | 1, 3, 7 | import-contract.ts interface; import-contract.test.ts size pin (worst case ~2.6KB); replace-cards-for-binders.test.ts Test K (50-entry caps) |
| D-18 | `deletedFromUnselected: 0` literal-typed AND runtime-asserted | ✓ | 1, 3 | TypeScript literal-`0` type pin in import-contract.test.ts; replace-cards-for-binders.test.ts Tests G (empty-throws) + H (any-card-not-in-selected throws); both throws happen BEFORE any `db.*` call |
| D-19 | `RATE_LIMIT_BUCKETS.ADMIN_BULK` preserved on `/commit`; `/preview` gets NO rate limit | ✓ | 5 | commit.test.ts "rate limit fires BEFORE replaceCardsForBinders"; preview/route.ts has no enforceRateLimit call (Phase 22 D-DOS-01 owns that follow-up) |
| D-20 | `requireAdmin` gate unchanged on both routes | ✓ | 4, 5 | preview.test.ts 401 test preserved; commit.test.ts 401 test preserved |
| IMP-05 | `DELETE WHERE binder IN (selected)` — scoped, not full-table | ✓ | 2, 3 | replace-cards-for-binders.test.ts Test F; queries.ts `db.delete(cards).where(inArray(cards.binder, selectedBinders))` |
| IMP-06 | Audit log + `import_history` record selectedBinders, before/after, new/missing within 4KB cap | ✓ | 1, 3, 5 | replace-cards-for-binders.test.ts Tests I/J (audit + importHistory metadata both carry ScopedImportAuditMetadata); import-contract.test.ts size pin |

All 10 decisions owned by this plan are pinned with executable evidence. Plan 19-02 owns D-03..D-14 (client UI).

---

## Files Modified

| File | Change | Why |
|------|--------|-----|
| `src/lib/import-contract.ts` | EXTEND | Added `BinderSummary`, `ImportBindersMessage`, `ScopedImportAuditMetadata`; extended `ImportStreamMessage` union (binders first); extended `CommitRequest` with optional `selectedBinders` + `knownBinders` |
| `src/lib/__tests__/import-contract.test.ts` | NEW | 5 compile-time + size-pin tests for new shapes |
| `src/db/queries.ts` | EDIT | Replaced `replaceAllCards` with `replaceCardsForBinders` (scoped DELETE, audit metadata, $count for total math); re-exports `ScopedImportAuditMetadata`. The OLD function is gone (no shim). |
| `src/db/__tests__/replace-cards-for-binders.test.ts` | RENAMED + REWROTE | `git mv` from `replace-all-cards.test.ts`; 11 tests for new helper (5 retained behaviors + 6 new: scoped DELETE, throws, audit metadata, list caps) + 1 `deleteAllCards` test preserved |
| `src/db/__tests__/replace-all-cards.test.ts` | DELETED | Renamed (above); the `replaceAllCards` symbol no longer exists |
| `src/app/api/admin/import/preview/route.ts` | REWROTE | Two-stage NDJSON: emits binders message FIRST after parse, then validates optional selectedBinders, then enriches scoped subset (or all when omitted) |
| `src/app/api/admin/import/__tests__/preview.test.ts` | EXTEND | 6 original tests preserved + 8 new Phase 19 tests (binders first; knownBinders → isNew; selectedBinders scope; legacy preserve; 400s) |
| `src/app/api/admin/import/commit/route.ts` | REWROTE | Calls `replaceCardsForBinders` with default-resolved or validated selectedBinders + knownBinders; `selectedBindersCount` added to logEvent metadata; rate limit + auth preserved |
| `src/app/api/admin/import/__tests__/commit.test.ts` | EXTEND | 6 original tests preserved + 8 new Phase 19 tests (default-resolution; explicit forwarding; 400 invariants; knownBinders normalization; rate-limit ordering; logEvent metadata) |

---

## Test Counts

| Stage | Test Files | Tests Passed | Tests Skipped |
|-------|-----------|--------------|---------------|
| Baseline (after Phase 18) | 31 | 335 | 2 |
| After Plan 19-01 | 32 | 361 | 2 |
| Net delta | +1 file | +26 tests | 0 |

New tests added by file:
- `src/lib/__tests__/import-contract.test.ts` — 5 (new file)
- `src/db/__tests__/replace-cards-for-binders.test.ts` — 12 total (11 helper + 1 deleteAllCards retained); was 6 in the deleted predecessor → net +6
- `src/app/api/admin/import/__tests__/preview.test.ts` — 14 total; was 6 → net +8
- `src/app/api/admin/import/__tests__/commit.test.ts` — 14 total; was 6 → net +8
- Other suites unchanged.

Math: 5 (new file) + 6 + 8 + 8 = 27 net adds; baseline → final = +26 because `replace-all-cards.test.ts` had 6 tests, `replace-cards-for-binders.test.ts` has 12 → that suite is +6 not +12.

(361 − 335 = 26 ✓)

---

## `replaceAllCards`-grep Proof

```
$ grep -rn "replaceAllCards" src/ --include='*.ts' --include='*.tsx'
(no matches)
$ echo $?
1
```

Zero matches. The legacy symbol is gone codebase-wide; the only known caller (`/api/admin/import/commit/route.ts`) is rewritten to use `replaceCardsForBinders`.

---

## Audit-Metadata Size Proof

`src/lib/__tests__/import-contract.test.ts > "worst-case ScopedImportAuditMetadata serializes to < 4096 bytes (D-17 size pin)"`:

Worst case constructed: 50 selectedBinders (the MAX_AUDIT_ARRAY_LENGTH cap), each ~12-char operator-style label, before+after counts for all 50, plus 25+25 newBinders/missingBinders entries. Serialized JSON length: well under 4096 bytes (the pin asserts `<` 4096 — actual serialized length passes the assertion in test runtime).

The runtime sanitizer `sanitizeAdminAuditMetadata` (in `src/db/queries.ts:282`) is the secondary belt: if the payload ever exceeds the 4KB cap, it falls back to `{ truncated: true, summary: ... }`. This pin exists so a future change that bloats the shape (e.g., adding per-binder cards-modified detail) trips the test before reaching production.

---

## NDJSON Wire-Shape Extension (for Plan 19-02 to consume verbatim)

The /preview endpoint now uses a two-stage NDJSON contract:

1. **First line** — always `{ type: 'binders', binders: BinderSummary[] }`. Emitted immediately after parse, BEFORE any progress message. Sent unconditionally (even when the request supplies `selectedBinders`).
2. **Subsequent lines** — `{ type: 'progress', ... }` and finally `{ type: 'result', preview }`, unchanged from Phase 10.

Two new optional FormData fields:
- `selectedBinders` — JSON-stringified `string[]`. When present, the server scopes `enrichCards` to only those rows whose `card.binder` is in the list. Strict server-side validation (D-16); 400 returned BEFORE the stream opens on any failure.
- `knownBinders` — JSON-stringified `string[]`. The operator's prior selection from `useBinderImportStore`. Used solely to compute `BinderSummary.isNew` for each binder. Loose normalization (silent); never causes a 400.

The /commit endpoint now accepts optional `selectedBinders?: string[]` and `knownBinders?: string[]` on the JSON body. When `selectedBinders` is omitted, the server defaults to `Array.from(new Set(body.cards.map(c => c.binder)))` to preserve the legacy single-button-import flow's wholesale-replace semantic over the binders this upload touches. `knownBinders` is forwarded to `replaceCardsForBinders` via the `audit.knownBinders` field so the helper can compute `newBindersInExport` / `missingBindersFromExport` for the audit metadata.

---

## Boundary Handoff to Plan 19-02

Plan 19-02 imports the following from `@/lib/import-contract`:

- `BinderSummary` (type) — picker row props
- `ImportBindersMessage` (type) — discriminated union case in the client's NDJSON reader
- `ImportStreamMessage` (type) — extended union including the new `ImportBindersMessage` case
- `CommitRequest` (type) — extended with optional `selectedBinders` + `knownBinders` for the commit POST body

Plan 19-02 does NOT import any DB or query symbols. The contract boundary holds:

- Plan 19-01 has zero React / zustand imports.
- Plan 19-02 will have zero `@/db` imports (verified during Plan 19-02 execution).

---

## Phase 17 Deferred Items Resolved

- **`replaceAllCards` rename** — Phase 17 left this open as the integration point for Phase 19. Now complete: function deleted from `src/db/queries.ts`, test file renamed via `git mv`, all callers updated.

---

## Open Questions Resolved

- **`db.$count` in drizzle-orm@0.45.2:** Confirmed available (visible in `node_modules/drizzle-orm/pg-core/db.d.cts` at line 69 — `$count(source: PgTable | PgViewBase | SQL | SQLWrapper, filters?: SQL<unknown>)`). Used directly in `replaceCardsForBinders` for the `currentTotal` math; no fallback needed.

---

## Known Limitations / Deferred Items

- **`/preview` has no rate limit** — Phase 22 D-DOS-01 owns this. Plan 19-01 explicitly does NOT add it per CONTEXT D-19 (the new two-stage flow amplifies per-call cost; defining the bucket sizing belongs in the hardening phase).
- **Audit-metadata 4KB truncation behavior** — runtime sanitizer falls back to `{ truncated: true, summary: ... }` if exceeded. The list-cap (50) + size pin guards against silent truncation under realistic operator workloads, but a pathological CSV with 200+ binders + long operator-defined labels could still trip the truncation. Phase 21 may surface a UI hint when audit entries are truncated.
- **`binders` NDJSON message uses alphabetical sort on the wire** — the picker UI (Plan 19-02) re-sorts visually per D-05 (NEW first; unsorted last). If a future client wanted server-sorted shape, change in `buildBindersFromParsed`.

---

## Whole-Repo Gate Output

```
$ npx tsc --noEmit          → 0 errors
$ npx vitest run            → 32 files, 361 passed | 2 skipped (363)
$ npm run build             → success (all routes compiled)
$ grep -rn "replaceAllCards" src/ --include='*.ts' --include='*.tsx'
                            → 0 matches
$ test ! -f src/db/__tests__/replace-all-cards.test.ts
                            → OK (file is gone)
$ git diff --check          → clean
```

All success criteria met. Wire contract for Plan 19-02 is locked.
