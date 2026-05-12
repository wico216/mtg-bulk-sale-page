---
status: resolved
trigger: CSV import on live deployment (wikos-spellbinder.vercel.app) is stuck at 0% during Scryfall pricing enrichment stage; v1.3.1 patch (2331068..555ddbc) was supposed to fix Axx-binder timeout via batched /cards/collection fetcher with parallel waves + per-card fallback, but symptom persists.
created: 2026-05-11
updated: 2026-05-11
---

# Debug: Scryfall enrichment stuck at 0

## Symptoms

- **Expected behavior:** CSV import progresses past 0% during Scryfall enrichment, completes, and shows binder picker / preview with prices populated.
- **Actual behavior:** Silent hang at 0% during the Scryfall pricing enrichment stage. No progress events ever advance from 0. No visible error.
- **Error messages:** None — silent hang, browser keeps spinning.
- **Timeline:** Symptom appeared / persisted after the v1.3.1 patch deployment (commits `2331068..555ddbc` pushed to `origin/main` on 2026-05-11, tag `v1.3.1`). The v1.3.1 patch was *specifically* intended to fix this exact symptom (Axx-binder import timeout).
- **Wait time before declaring stuck:** > 5 minutes (long enough to rule out "just slow").
- **Reproduction:**
  1. Upload `~/Downloads/ManaBox_Collection.csv` (2 MB, dated 2026-05-10) to the import flow on `wikos-spellbinder.vercel.app`.
  2. Watch the progress UI during the Scryfall enrichment phase.
  3. Progress bar stays at 0%; eventually give up.

## Environment

- **Production:** `wikos-spellbinder.vercel.app` (Vercel, neon-http DB)
- **Local:** confirmed reproducible end-to-end via tsx scripts
- **Patch commits in scope:**
  - `2331068` feat(scryfall): batched /cards/collection fetcher + parallel waves
  - `2e6174e` feat(parser): carry Scryfall UUID onto InventoryRow
  - `a5deb0f` refactor(enrichment): batch path for rows with Scryfall UUID, fallback to per-card
  - `555ddbc` test(parser): adapt Test A fixtures for scryfallId field

## Evidence

- timestamp: 2026-05-11
  finding: scryfallId fully populated on all 12,471 parsed rows (and all 1,384 Axx-binder rows) — hypothesis #4 (parser doesn't carry UUID) ELIMINATED.
  source: `npx tsx scripts/audit-manabox.ts` on the operator's CSV

- timestamp: 2026-05-11
  finding: papaparse `dynamicTyping: true` does NOT mangle the Scryfall UUID field for any of the 12,749 raw CSV rows.

- timestamp: 2026-05-11
  finding: Scryfall `/cards/collection` endpoint itself is healthy and fast (~340ms RTT for a 2-id POST).

- timestamp: 2026-05-11
  finding: Full enrichment of 12,471 cards on cold cache takes ~233 seconds wall-clock. The first `onProgress` callback fires at +194,260ms — meaning the UI sees 0% for OVER 3 MINUTES of silence even on a happy-path run.

- timestamp: 2026-05-11
  finding: ROOT CAUSE — Scryfall returns HTTP 429 (Retry-After: 60) every ~25-30 successful /cards/collection batches. The v1.3.1 `lastRequestTime` rate-limit gate is a no-op under concurrency (all 8 concurrent batches in a wave read the same value, all pass the elapsed check, all fire in parallel). Net pattern: 25 batches in ~3s → 8 simultaneous 429s with Retry-After:60 → 60s stall → 25 more batches → 60s stall.
  source: instrumented per-wave timing trace, cold cache

- timestamp: 2026-05-11
  finding: Secondary bug — `enrichCards` awaits the ENTIRE `fetchCardsByScryfallIds()` batch fetch (potentially 3+ minutes on cold cache) BEFORE entering the per-card loop that fires `opts.onProgress`. The route handler emits ONE initial `{type:"progress", done:0, total:N}` and then nothing else fires until the batch fully resolves. UI sees 0% for the full duration.

- timestamp: 2026-05-11
  finding: Tertiary bug — stage-1 of the import flow (no `selectedBinders`) is ONLY used by the client to get the binders list. The client aborts the stream after the binders message arrives. But the server doesn't check `request.signal`, so it keeps wastefully enriching all 12k+ cards in the background — burning Scryfall's rate limit budget for the operator's IP. This breaks the subsequent stage-2 call (with `selectedBinders` set), which then hits the depleted bucket and 429-stalls.

- timestamp: 2026-05-11
  finding: No `vercel.json` and no Pro-tier indicator. The route sets `maxDuration: 300` but on Vercel Hobby tier that's capped to 10s. A single 429 with Retry-After:60 GUARANTEES the function is killed mid-await on Hobby. On Pro tier (300s), enrichment of all 12k cards survives but stalls long enough that the operator perceives it as "stuck" and gives up.

## Eliminated

- **Hypothesis #1 (v1.3.1 not deployed):** v1.3.1 tag exists on `origin/main` HEAD; commits `2331068..555ddbc` are the most-recent commits.
- **Hypothesis #4 (scryfallId field not carried onto rows):** Eliminated — audit confirms 100% of parsed rows have a valid 36-char UUID, including all Axx binder rows.
- **Hypothesis #5 (ADMIN_BULK 429 blackhole):** Possible to hit, but won't produce a silent hang — it returns a 429 Response BEFORE the stream opens, which the client surfaces as an "Upload failed (429)" error.

## Resolution

### Root cause

The v1.3.1 batched `/cards/collection` path was supposed to be ~5s wall-time for the operator's 12,471-row CSV. In practice it is **194–280 seconds** because of three compounding bugs:

1. **Broken rate-limit gate causes Scryfall self-DOS.** `fetchCollectionBatch` uses a module-level `lastRequestTime` to gate requests at 120ms minimum spacing. When `fetchCardsByScryfallIds` calls `Promise.all(wave.map(...))` with 8 concurrent batches, all 8 enter `fetchCollectionBatch` simultaneously, all read the same `lastRequestTime`, all pass the elapsed check, all set `lastRequestTime` almost simultaneously, all `fetch()` in parallel. The 120ms gate is effectively a no-op under concurrency. Sustained ~6 req/sec triggers Scryfall to return `429 Too Many Requests` with `Retry-After: 60` to ALL in-flight batches simultaneously every ~25 successful batches.

2. **Progress emission is bunched at the end.** `enrichCards` awaits the entire batch fetch BEFORE starting the per-card loop. The route handler emits `{done:0, total:N}` then NOTHING until the batch fully resolves. UI sees 0% the entire time the batch is in flight.

3. **Stage-1 enriches wastefully.** The client only needs the `binders` message in stage 1; it aborts the stream immediately afterward. But the server doesn't check `request.signal`, so it keeps enriching all 12k+ cards in the background, burning Scryfall's per-IP rate-limit budget — which then makes the subsequent stage-2 call 429-stall.

### Fix (v1.3.2)

Four coordinated changes:

1. **`src/lib/scryfall.ts`** — replace the broken `lastRequestTime` check with a true critical-section gate (`gateChain: Promise<void>`) that chains every concurrent caller through a serial 250ms-spaced queue. Add `COLLECTION_RATE_LIMIT_MS = 250` (4 req/sec sustained) for the batch path only — the per-card `fetchCard` path keeps its existing 120ms gate. Reduce `COLLECTION_CONCURRENCY` from 8 to 4. Add `onBatchComplete` callback to `fetchCardsByScryfallIds` so callers can render incremental progress.
2. **`src/lib/enrichment.ts`** — wire `onBatchComplete` into `opts.onProgress` so the route handler emits a progress NDJSON line every ~250-1000ms during the batch-fetch phase (the v1.3.1 implementation was silent for the full batch duration). Also accept `opts.signal` and poll it in the per-card fallback loop.
3. **`src/app/api/admin/import/preview/route.ts`** — short-circuit after the binders message when `selectedBinders` is undefined (stage-1 calls). Stop calling `enrichCards` in stage 1; this is the single biggest fix because it prevents the wasteful 12k-card enrichment from running on every CSV upload. Also pass `request.signal` to `enrichCards` and check it before emitting `result` so client aborts stop wasting compute.
4. **`src/app/api/admin/import/__tests__/preview.test.ts`** — update 3 tests to reflect the new stage-1 short-circuit contract: the 2 tests that asserted enrichment runs without `selectedBinders` now pass `selectedBinders: ["unsorted"]` (matching the real client's stage-2 flow), and the test that explicitly asserted "legacy full enrichment when selectedBinders is undefined" is rewritten to assert the new stage-1 short-circuit (binders message + close).

### Files modified

- `src/lib/scryfall.ts`
- `src/lib/enrichment.ts`
- `src/app/api/admin/import/preview/route.ts`
- `src/app/api/admin/import/__tests__/preview.test.ts`

### Verification

- Full test suite: 464 passing, 2 skipped (no regressions). 129 lib + import-API tests all green.
- TypeScript: clean (`tsc --noEmit`).
- ESLint: clean on all four modified files.
- Cold-cache cardinality trace (instrumented): the batch fetch now drives progress NDJSON lines every ~1s — verified that the UI will see motion within ~1s of the enrichment phase starting.
- Stage-1 short-circuit: the new test "selectedBinders === undefined short-circuits after binders message (v1.3.2)" asserts the route emits ONLY the binders message and does not call `enrichCards` when `selectedBinders` is omitted, eliminating the wasteful background enrichment that was depleting Scryfall's rate-limit budget.

### Known limitation

The full 12,471-card cold-cache enrichment is still rate-limited by Scryfall to ~6 req/sec sustained (their per-IP throttle on `/cards/collection`). At 75 ids/batch × 4 batches/sec target, that's ~26 seconds minimum for 7,722 unique IDs on a perfectly cooperating Scryfall, but in practice we'll see at least one 60-second Retry-After:60 stall mid-run if the operator ever triggers a stage-2 import of ALL 16 Axx binders. The fix in this commit ensures (a) the UI shows continuous progress motion and (b) stage-1 doesn't wastefully consume rate budget. The architectural fix for a true "one-shot import all binders" workflow would be a background queue (out of scope for v1.3.2).
