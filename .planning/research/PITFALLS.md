# Pitfalls Research — v1.4 (Cron Price Refresh + Import Picker UX)

**Domain:** Adding scheduled jobs (Vercel Cron) + UI defaults to an existing v1.3 inventory store (Next.js 16.2.2 + Neon Postgres + Scryfall, ~26,292 LOC, 464 tests).
**Researched:** 2026-05-20
**Confidence:** HIGH (Vercel docs + project history) for cron pitfalls; HIGH (read existing components) for picker UX pitfalls.
**Downstream consumer:** Roadmap + per-phase planning for v1.4. Operator was burned by env-gated tests not running in CI (Phase 18 → v1.3.5 hotfix) — that pattern is called out explicitly throughout.

> Replaces the v1.3 PITFALLS.md (binder-aware inventory). The v1.3 research lives in the milestone audit at `.planning/milestones/v1.3-MILESTONE-AUDIT.md` if needed.

---

## TL;DR — Pitfall Severity Map

| # | Pitfall | Severity | Phase to address |
|---|---------|----------|------------------|
| 1 | Cron auth bypass (missing `Authorization: Bearer` check) | **HIGH** | v1.4 Phase A "cron handler" |
| 2 | Env-gated cron tests not running in CI (Phase 18 repeat) | **HIGH** | v1.4 Phase A "cron handler", v1.4 Phase D "hardening" |
| 3 | Operator can't tell what `defaultCheckedFor` does after spec change (regression of D-09/D-10 memory contract) | **HIGH** | v1.4 Phase B "picker UX" |
| 4 | Cron + Manual button race → double-refresh, audit log liar | MEDIUM | v1.4 Phase A "cron handler" |
| 5 | Scryfall partial failure overwrites real prices to NULL | MEDIUM | v1.4 Phase A "cron handler" |
| 6 | `CRON_SECRET` silently missing in Vercel env → 401 forever | MEDIUM | v1.4 Phase C "health surface" |
| 7 | "Cron handler ran on first hit" + `next dev` runs nothing → operator ships broken | MEDIUM | v1.4 Phase D "hardening" |
| 8 | Empty-selection commit ships nothing (no helper text / no disabled state) | MEDIUM | v1.4 Phase B "picker UX" |
| 9 | Vercel Hobby cron drifts within the hour, fires at most once/day | MEDIUM | v1.4 Phase A "cron handler" |
| 10 | Stale-price during checkout race (acceptable per Phase 11 snapshot) | LOW | confirm in v1.4 Phase A |
| 11 | Storefront sees price change mid-session (UX surprise, not bug) | LOW | confirm in v1.4 Phase A |
| 12 | Audit log unbounded growth from cron + manual rows | LOW | rely on Phase 14 + Phase 15 bounded metadata |
| 13 | Cron handler exceeds 5-minute Vercel cap with cold cache | LOW | v1.4 Phase A "cron handler" |
| 14 | Vercel may deliver the same cron event twice → double-refresh | LOW | v1.4 Phase A "cron handler" (idempotency) |
| 15 | Keyboard nav / aria regression in Select-All button | LOW | v1.4 Phase B "picker UX" |

---

## Critical Pitfalls

### Pitfall 1: Cron auth bypass — anyone with the URL drains Scryfall budget

**Severity:** HIGH

**What goes wrong:**
The cron handler at e.g. `/api/admin/cron/refresh-prices` is exposed as a GET route. If the handler doesn't strictly compare `Authorization: Bearer ${CRON_SECRET}`, any attacker (or curious friend with devtools open) can hit that URL and trigger a full ~1,400-card Scryfall refresh on demand. Scryfall has documented sustained rate-limit triggers around ~6 req/sec (see `src/lib/scryfall.ts:101-105` comment) — repeated abuse will get the operator IP-banned from Scryfall and the audit log will fill with garbage runs.

**Why it happens:**
- Vercel cron's GET-only invocation tempts a "well it's GET so it's safe" mental shortcut.
- The Vercel docs (`/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs`, verified 2026-02-27) describe `CRON_SECRET` auto-injection as "you _can_ secure your cron job invocations" — opt-in phrasing, not enforced.
- The existing admin surfaces all gate via `requireAdmin()` (NextAuth session) which uses Google OAuth — that won't work for a cron caller, so the impulse is "just leave it open."

**Prevention strategy (concrete):**
- **File:** `src/app/api/admin/cron/refresh-prices/route.ts`
- **Code shape (mirror Vercel's verified canonical pattern):**
  ```ts
  // Pattern verified at vercel.com/docs/cron-jobs/manage-cron-jobs (2026-02-27)
  export async function GET(request: Request) {
    const auth = request.headers.get("authorization");
    if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
      logEvent({
        level: "warn",
        event: "cron.refresh_prices.unauthorized",
        route: "api/admin/cron/refresh-prices",
        // DO NOT log the auth header value — would echo a secret on bypass attempts
      });
      return new Response("Unauthorized", { status: 401 });
    }
    // ... refresh logic
  }
  ```
- Treat missing `CRON_SECRET` env var as a fail-CLOSED condition (the `!process.env.CRON_SECRET` clause in the guard). Never accept-all-when-missing.
- Add a route-level test that asserts 401 with no header, 401 with wrong header, 200 with correct header. This test is NOT env-gated (uses a mocked `process.env`) so it runs in CI by default — see Pitfall 2.

**Warning signs:**
- Unauthenticated GET to the path returning anything other than 401.
- `cron.refresh_prices.start` log events appearing more than 1× per day on Hobby.
- Scryfall 429s in logs with no concurrent operator activity.

**Phase to address:** v1.4 Phase A (cron handler).

---

### Pitfall 2: Env-gated cron tests not running in CI — the v1.3.5 repeat

**Severity:** HIGH (this is the call-out from `<downstream_consumer>`)

**What goes wrong:**
The cron path is naturally env-gated on `CRON_SECRET` and on a live DB. If the operator follows the "happy path" pattern from `src/db/__tests__/orders.concurrent.test.ts` and gates the whole test suite on `process.env.CRON_SECRET` being set (a la `const describeIfCron = SHOULD_RUN ? describe : describe.skip`), the entire cron-handler test file silently skips in CI. The exact failure mode that produced the v1.3.5 hotfix (Phase 18 allocator regression — see `.planning/todos/pending/01-phase-18-concurrent-proof.md`) recurs: a regression ships to production undetected because the test that would have caught it never ran in CI.

**Why it happens:**
- Established project precedent: `orders.concurrent.test.ts:71-75` uses `describe.skip` when `TEST_DATABASE_URL` is unset. Copy-paste tempting.
- "Cron requires CRON_SECRET" mental conflation: the **handler** requires CRON_SECRET, but the **test** of the handler can MOCK CRON_SECRET. Conflating these env-gates the test.
- v1.3 retrospective is explicit: "5x flake check requires real DB credentials — the multi-binder concurrent-proof tests are env-gated on TEST_DATABASE_URL; the executor can't provision a Neon test branch from inside the autonomous run; permanent operator handoff." This is treated as normal; the symptom is that those tests have never run in CI as of v1.3.5.

**Prevention strategy (concrete):**
- **Split tests into two tiers explicitly:**
  - **Tier 1 (default-run, NOT env-gated):** Unit tests for the GET handler using a per-test `vi.stubEnv("CRON_SECRET", "test-secret-value")` + mocked Scryfall fetcher + mocked DB. Asserts: auth gate (401/200), call counting, partial-failure handling, audit-log row shape, single-flight guard. This file lives at `src/app/api/admin/cron/refresh-prices/__tests__/route.test.ts` and runs on every `npm test`.
  - **Tier 2 (env-gated, opt-in):** Live-DB integration tests on a Neon test branch. Use the `TEST_DATABASE_URL` plumbing already established in `orders.concurrent.test.ts:57` — but Tier 1 must cover the handler logic completely on its own.
- **File-level comment must say this out loud:**
  ```ts
  // ⚠️ This file is the DEFAULT-RUN cron-handler suite. It is NOT env-gated;
  // it runs on every `npm test` in CI. Live-DB integration is intentionally
  // OUT of this file — see ../integration/route.live.test.ts for that.
  // Background: .planning/todos/pending/01-phase-18-concurrent-proof.md
  ```
- **Pattern reference:** `src/lib/__tests__/csv-parser-perf.test.ts:21` is the established "explicitly NOT env-gated" pattern — its file header says so verbatim. Reuse the comment language.
- **CI assertion:** Add a meta-test or grep step that fails if `route.test.ts` (default-run) contains the literal string `describe.skip` or `runIf`. This is the explicit guard against the v1.3.5 failure mode.

**Warning signs:**
- The cron handler test file mentions `describe.skip` or `describe.runIf` at the top level.
- Test run summary says "X skipped" with no human noticing.
- The next refactor of `enrichCards`/`fetchCardsByScryfallIds` lands without the cron test verifying batch behavior.

**Phase to address:** v1.4 Phase A (cron handler) writes the Tier 1 file with the explicit "NOT env-gated" header. v1.4 Phase D (hardening) adds the meta-test or lint rule.

---

### Pitfall 3: Picker default-spec breaks the existing memory contract (D-09 / D-10)

**Severity:** HIGH (silent UX regression on operators with existing localStorage state)

**What goes wrong:**
The v1.4 spec says "all binders deselected by default." But `src/lib/store/binder-import-store.ts:53-58` already implements a **carefully designed** default-checked policy:

```ts
defaultCheckedFor: ({ name, isNew }) => {
  if (name === "unsorted") return false;          // D-08: unsorted always UNCHECKED
  const prior = get().lastSelection[name];
  return prior ?? isNew;                          // D-09: remembered selection wins; NEW binders default ON
},
```

A naive implementation that hard-resets to `{}` on picker open will:
- **Throw away the "remembered selection" feature** the operator depends on (Phase 19 D-09).
- **Make NEW binders default-OFF**, contradicting the prior Phase 19 mental model (operator dropped a fresh CSV expecting NEW binders pre-checked).
- **Make the will-delete panel ambiguous**: today, will-delete is default-CHECKED (line 256 in `import-client.tsx`); if v1.4 hard-resets everything, the operator must now opt back in to deletes too — a destructive operation that should never default-on after the change.

The picker visible at `src/app/admin/import/_components/binder-picker.tsx` is "controlled" — it reads from `selection` prop. The current init at `import-client.tsx:244-258` is the contract; the change must be a **deliberate, documented re-architecture**, not a one-line "delete the call to `defaultCheckedFor`."

**Why it happens:**
- "All deselected default" sounds simple. It contradicts a non-obvious Phase 19 invariant documented only in a code comment (D-08/D-09/D-10).
- The spec mentions "Select All / Deselect All buttons" — those affordances are what compensate for losing the memory feature. A reviewer might not realize the memory feature existed.

**Prevention strategy (concrete):**
- **Decide explicitly during v1.4 Phase B planning:**
  - Option A: Drop the memory feature entirely — `defaultCheckedFor` becomes `() => false`; `Select All` / `Deselect All` are the only affordances. Document the removal in the Phase B SUMMARY.md and update the comment block at `binder-import-store.ts:11-17` (the "D-09 / D-10 memory" comment becomes stale).
  - Option B: Keep the memory feature; add Select All/Deselect All on top, NOT replacing the default. Reframe the spec line as "Select All / Deselect All buttons + DEFAULT is unchanged."
  - Option C: Memory persists across sessions, but each picker-open begins fully unchecked (memory is reflected as "last used" badge, not pre-checked state). Then `Select All` is the operator's recovery affordance.
- **Whichever option:** rewrite the will-delete default-CHECKED behavior (`import-client.tsx:255-256`) to match. Today will-delete is default-CHECKED because "the operator's prior selection said it was there and now it's gone, so the operator wants it gone." If v1.4 drops the memory premise, this premise dies too — re-derive the policy.
- **Add 3 explicit tests in `__tests__/import-client.test.tsx`:**
  1. Fresh operator (no localStorage entry): picker opens with N binders → all unchecked → `Commit` button disabled.
  2. Returning operator with localStorage `lastSelection = { binder-a: true }` + upload contains `binder-a`: assert v1.4 chosen behavior (per Option A/B/C decision above).
  3. Upload contains `binder-a` (missing from localStorage) + will-delete contains `binder-b`: assert will-delete default state.

**Warning signs:**
- The Phase B SUMMARY.md doesn't mention `binder-import-store.ts` at all.
- The diff to `import-client.tsx:243-258` removes the `defaultCheckedFor` call without touching `binder-import-store.ts`.
- The operator says "wait, where did my remembered binders go?" after first v1.4 deploy.

**Phase to address:** v1.4 Phase B (picker UX). The CONTEXT.md for that phase MUST cite the existing `defaultCheckedFor` and pick one of Option A/B/C.

---

## Moderate Pitfalls

### Pitfall 4: Cron + Manual button race → double-refresh, audit log liar

**Severity:** MEDIUM

**What goes wrong:**
Cron fires at, say, 03:47 UTC (Vercel Hobby drifts within the hour — confirmed at `/docs/cron-jobs/manage-cron-jobs#cron-jobs-accuracy`). The operator clicks "Refresh now" at 03:47:02. Two concurrent invocations both:
- Iterate the full 1,400-card list.
- Both write `card.price = ?` rows.
- Both insert an `admin_audit_log` row with action="price_refresh_started".
- Scryfall sees ~8 req/sec instead of ~4, trips the 429 rate-limit gate.

Worse: both runs partially complete, the cron run finishes second and writes `updated=1400, unchanged=0`; the manual run finishes first and writes `updated=1400, unchanged=0`. The summary numbers are physically impossible to reconcile because they overlap. `lastPriceRefreshAt` on `/admin/health` flickers nondeterministically depending on which insert COMMITs last.

**Why it happens:**
Vercel docs (`/docs/cron-jobs/manage-cron-jobs#controlling-cron-job-concurrency`, last updated 2026-02-27) explicitly call this out: "If your cron job runs longer than the interval between invocations, Vercel can trigger a second instance while the first is still running... To prevent concurrent runs, use a lock mechanism." For a once-daily Hobby cron the same-cron-twice case is rare, but the cron-vs-manual race is the realistic one.

**Prevention strategy (concrete):**
- **Single-flight via Postgres advisory lock** (matches the v1.3 "pure SQL, no JS coordination" pattern from Phase 18 allocator):
  ```sql
  -- Try to acquire the advisory lock; bail immediately if held.
  SELECT pg_try_advisory_lock(hashtext('cron.refresh_prices')) AS acquired;
  ```
  If `acquired = false`, return `409 Conflict` (manual) or quietly log + 200 (cron). Release with `pg_advisory_unlock` in a `try/finally`.
- **Audit log "in_progress" sentinel as a secondary signal:** insert a row with `action='price_refresh_started'` before the work and `action='price_refresh_completed'` after; the audit page (Phase 15) can display "stuck refresh > 10 min" if a started row has no matching completed.
- **Test (Tier 1, default-run):** mock the advisory-lock call to return `false` and assert the second invocation returns 409 / no Scryfall calls.

**Warning signs:**
- Two `price_refresh_started` audit rows with overlapping timestamps.
- `lastPriceRefreshAt` updates twice within 30 seconds.
- Scryfall 429 rate-limit warnings clustered at the cron firing window.

**Phase to address:** v1.4 Phase A (cron handler).

---

### Pitfall 5: Scryfall partial failure overwrites real prices to NULL

**Severity:** MEDIUM

**What goes wrong:**
A subset of cards in the inventory (let's say 12 of the operator's 11-known etched + a few obscure promos) come back as `not_found` from `/cards/collection` (see `fetchCardsByScryfallIds` at `src/lib/scryfall.ts:178-181` — `json.not_found` is returned but ignored). If the refresh logic does the obvious thing — "loop over all cards, look up each in the `Map<string, ScryfallCard>` from `fetchCardsByScryfallIds`, write the price" — those 12 cards get their `price` set to `NULL` (or `undefined`, depending on serialization). Yesterday they had real prices; today they're "Price N/A" on the storefront.

This is the **exact same bug class** that bit Phase 17 (etched cards mispriced as `normal`). The schema even encodes this risk: `price: integer("price")` is nullable (`schema.ts:43` — comment: "null means 'Price N/A'"), so the type system won't catch the bug.

**Why it happens:**
- The `fetchCardsByScryfallIds` contract (line 213-216) says "ids that Scryfall returns as `not_found` are simply absent from the Map." Easy to forget on the caller side.
- The naive write loop `for (const card of allCards) { card.price = scryfallMap.get(card.scryfallId)?.prices.usd ?? null; }` is the wrong pattern.
- A card with no `scryfallId` (legacy import before v1.0 stored that) would also `?.prices.usd ?? null`, silently nuking its price.

**Prevention strategy (concrete):**
- **Per-card try/skip with explicit counters:**
  ```ts
  for (const card of allCards) {
    if (!card.scryfallId) { skipped.push(card.id); continue; }
    const fresh = scryfallMap.get(card.scryfallId);
    if (!fresh) { failed.push(card.id); continue; }       // NOT FOUND on Scryfall — keep old price
    const newPrice = fresh.prices.usd ? Math.round(parseFloat(fresh.prices.usd) * 100) : null;
    if (newPrice === card.price) { unchanged++; continue; }
    updates.push({ id: card.id, price: newPrice });
  }
  ```
- **NEVER write `price = NULL` from the refresh path** unless Scryfall's response explicitly said `prices.usd === null` (card has no market price). The "not in scryfallMap" branch must SKIP, not write.
- **Audit log row shape (cite Phase 14 bounded-metadata pattern, `schema.ts:88-110`):**
  ```ts
  metadata: {
    updated: number,     // prices actually changed
    unchanged: number,   // looked up, same price
    failed: number,      // Scryfall not_found
    skipped: number,     // no scryfallId on row
  }
  ```
- **Test (Tier 1):** seed a mock with 100 cards, 5 of which the mock fetcher omits; assert those 5 retain their original `price` value after refresh.

**Warning signs:**
- After a refresh, the storefront suddenly has more "Price N/A" cards than before.
- `failed` count in audit log == count of operator's known-etched / known-obscure cards.
- Operator reports "every Scryfall refresh, some cards lose their prices again."

**Phase to address:** v1.4 Phase A (cron handler).

---

### Pitfall 6: `CRON_SECRET` silently missing in Vercel env → 401 forever, undetected for weeks

**Severity:** MEDIUM (silent failure mode; operator burned by missing-env-vars before)

**What goes wrong:**
The operator deploys v1.4. Forgets to set `CRON_SECRET` in the Vercel project dashboard. Vercel still triggers the cron — but with no `CRON_SECRET` env var to inject, the Authorization header is missing (or differs from `Bearer undefined`). The handler 401s. **The cron job in the Vercel dashboard shows "executed successfully"** because from Vercel's perspective the HTTP request completed and returned a status code. Prices never refresh. The operator only notices weeks later when the storefront prices are visibly stale.

**Why it happens:**
- Vercel cron dashboards report HTTP-level success, not application-level success.
- There's no health-check today that knows what `lastPriceRefreshAt` SHOULD be — only that it can be displayed.
- Vercel cron errors don't retry (`/docs/cron-jobs/manage-cron-jobs#cron-job-error-handling`: "Vercel will not retry an invocation if a cron job fails").

**Prevention strategy (concrete):**
- **Fail-loud on the health surface** at `src/app/api/admin/health/route.ts`. Today `envChecks()` covers `AUTH_SECRET`, `AUTH_GOOGLE_*`, `RESEND_API_KEY`, `SELLER_EMAIL`. Add a fifth literal-only check:
  ```ts
  const cronSecret = isPresent(process.env.CRON_SECRET) ? "configured" : "missing";
  // ...
  checks: { database, authSecret, googleOAuth, email, cronSecret }
  ```
  Top-level `ok` flips to `false` when `cronSecret === "missing"`. The existing test at `__tests__/route.test.ts` already covers the missing-env pattern — extend it.
- **Cron-staleness alert:** add `lastPriceRefreshAt` to `AdminHealthRecent`. If `Date.now() - lastPriceRefreshAt > 36 * 3600 * 1000` (36h cushion past the daily cadence), surface that on `/admin/health` as a yellow warning. The `getAdminHealthSnapshot()` helper at `src/db/admin-health.ts` already does parallel MAX reads against orders/import_history/admin_audit_log — add a MAX read on the audit log filtered by `action LIKE 'price_refresh%'`.
- **Smoke script extension** (`scripts/smoke-production.ts`): one additional check that GETs `/api/admin/health` and asserts `body.checks.cronSecret === "configured"` AND `body.recent.lastPriceRefreshAt` is within 36h.

**Warning signs:**
- `/admin/health` shows `cronSecret: missing`.
- `lastPriceRefreshAt` is null or > 36h old.
- Vercel cron logs show 401 responses every day.

**Phase to address:** v1.4 Phase C (health surface).

---

### Pitfall 7: `next dev` runs nothing — operator ships broken cron

**Severity:** MEDIUM

**What goes wrong:**
Operator runs `npm run dev` (which is `next dev` — `package.json` scripts confirmed). Hits `http://localhost:3000/api/admin/cron/refresh-prices` in a browser to "test the cron job locally." Browser sends no `Authorization` header. Handler 401s. Operator assumes "ah, auth must be the issue locally; in production the cron will provide it." Operator ships. Production cron also 401s for an unrelated reason (no `CRON_SECRET` env var — Pitfall 6) — but operator can't tell, because both look the same locally.

Alternatively: operator follows Vercel's local-dev docs ("just visit `http://localhost:3000/api/cron`" — `/docs/cron-jobs/manage-cron-jobs#running-cron-jobs-locally`) and concludes the cron works locally, doesn't realize cron only fires on Vercel deployments. Vercel docs explicitly state: "There is currently no support for `vercel dev`, `next dev`, or other framework-native local development servers."

**Why it happens:**
- The cron handler is a regular GET route — looks identical to any other API route locally.
- `next dev` doesn't run the cron scheduler. Nothing local does.
- Vercel's docs page about local dev casually says "just visit the URL," which is misleading for testing the SCHEDULING; it's only useful for testing the handler logic.

**Prevention strategy (concrete):**
- **Add a "dev verify" helper script:** `scripts/verify-cron-locally.ts` that does the equivalent of `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/admin/cron/refresh-prices` and asserts a 200 response with the expected audit-log row count. Operator runs `npm run cron:verify` against a running `next dev`. Add to `package.json` scripts.
- **README runbook section** (extend the existing operator runbook from Phase 15-02): subsection "Verifying cron deploys" with three steps:
  1. Check `vercel.json` exists and contains the crons entry.
  2. Confirm `CRON_SECRET` is set in Vercel project env (Production env, NOT just Preview).
  3. After the next deploy, watch the Vercel dashboard "Cron Jobs" section for the first invocation — verify 200, not 401.
- **Phase D verification gate:** the v1.4 Phase D VERIFICATION.md should require operator-verified live cron invocation post-deploy (mirrors Phase 22's 22-HUMAN-UAT.md pattern).

**Warning signs:**
- Operator says "I tested the cron locally and it works" without mentioning the live Vercel verification.
- `vercel.json` is missing from the repo (it does NOT exist today — confirmed by file scan).
- No `npm run cron:verify` or equivalent script.

**Phase to address:** v1.4 Phase D (hardening + UAT).

---

### Pitfall 8: Empty-selection commit ships nothing, operator confused

**Severity:** MEDIUM

**What goes wrong:**
With v1.4's "all-deselected default," the picker opens with nothing checked. There may or may not be a will-delete panel. If both are empty, hitting Commit either:
- (Bad path 1) Submits an empty `selectedBinders` array, the server treats this as "no-op" or worse "DELETE nothing INSERT nothing," and the operator gets "Imported 0 cards" with no explanation.
- (Bad path 2) Triggers an error response that says "no binders selected" but no inline UI cue prevented the click in the first place.

The existing code already has a partial mitigation: `import-client.tsx:280-284` early-returns if both arrays are empty, AND the Continue button is `disabled={!canContinue}` at line 644. The pitfall is during the v1.4 refactor — if "Select All / Deselect All" is added without revisiting the disabled-button logic and the empty-state copy, a regression here is easy.

**Why it happens:**
- The current empty-state guard is split across `handleConfirmPicker` (line 280) AND the button's `disabled` (line 644) AND a defensive comment (line 282). It's fragile to refactor.
- v1.4 may introduce a separate "Continue with empty selection?" path (operator wants to refresh prices via the picker view? out of scope but tempting).
- The header text "Select binders to import (0 of 7)" at `binder-picker.tsx:78-79` is informative but easy to ignore.

**Prevention strategy (concrete):**
- **Explicit empty-state UI** in the picker section: when `selectedCount === 0 && willDeleteCount === 0`, render a short helper line above the Continue button:
  > "Select at least one binder to continue. Use Select All to start with everything checked."
- **Keep the disabled button** but add an `aria-describedby` pointing at the helper text so screen readers explain why the button is disabled.
- **Test** (`__tests__/import-client.test.tsx`):
  - Open picker → assert helper text visible → assert Continue button disabled with `aria-disabled="true"`.
  - Click Select All → assert helper text hidden → assert button enabled.
  - Click Deselect All → assert helper text visible again.

**Warning signs:**
- Operator clicks a non-disabled Continue button and gets `error: "no binders selected"` JSON.
- Operator can't figure out what they're supposed to do on first import.
- A11y check (Lighthouse or axe) flags the disabled button as lacking explanation.

**Phase to address:** v1.4 Phase B (picker UX).

---

### Pitfall 9: Vercel Hobby cron drifts within the hour, fires at most once per day

**Severity:** MEDIUM (sets operator expectations correctly; not a code defect)

**What goes wrong:**
The spec says "daily at off-peak." On Hobby, Vercel docs (`/docs/cron-jobs/manage-cron-jobs#cron-jobs-accuracy`, verified 2026-02-27) state:
> "Hobby users have two cron job restrictions. First, cron jobs can only run once per day. Expressions that run more frequently will fail deployment. Second, Vercel may invoke these cron jobs at any point within the specified hour to help distribute load across all accounts. For example, an expression like `0 8 * * *` could trigger an invocation anytime between 08:00:00 and 08:59:59."

So a cron expression like `0 3 * * *` ("3 AM UTC") will actually fire somewhere between 03:00 and 03:59 UTC. If the operator picks a "noisy" hour (e.g. 0 hours UTC = global midnight = high contention on Vercel's scheduler), drift may concentrate at the end of the window. This is fine — but the spec must not assume minute-precision.

Additionally, an expression like `*/30 * * * *` (every 30 min) **will fail at deploy time** on Hobby — not just degrade.

**Why it happens:**
- Mental model of cron is "cron is precise" from POSIX cron.
- Marketing pages don't surface the Hobby restriction; only the deep docs.

**Prevention strategy (concrete):**
- Pick `0 9 * * *` (09:00–09:59 UTC = 02:00 PT, off-peak for the operator's likely timezone) and document the +/- 59min window in the `vercel.json` adjacent comment OR a top-of-file comment in the cron route handler.
- Phase A SUMMARY.md must include a sentence: "Hobby tier fires once per day at most, within a 59-minute window starting at the specified hour."
- If the operator later upgrades to Pro, the same expression auto-tightens to minute-precision — no code change required.

**Warning signs:**
- A `vercel.json` cron schedule with `*/` or any frequency < 1/day.
- Deployment fails with a Vercel error about cron frequency on Hobby.
- Operator says "the cron fires at the wrong time every day" — actually it's drift, working as designed.

**Phase to address:** v1.4 Phase A (cron handler).

---

## Low-Severity / Confirmed Acceptable

### Pitfall 10: Stale-price during checkout race (operator's analysis is correct)

**Severity:** LOW

**Confirm:** Checkout snapshots price at order time via `placeCheckoutOrder` (`src/db/orders.ts` allocator — Phase 18). The `order_items.unitPrice` is captured from the SQL `cards.price` at the moment of the FOR UPDATE lock. The cron refresh writing to `cards.price` mid-checkout will be blocked by row lock if the operator is unlucky enough to be checking out exactly when the refresh hits that row; the row lock serializes the two ops and the order sees one consistent price. **No correctness risk** — confirms operator's hypothesis.

**Phase:** v1.4 Phase A SUMMARY should cite this snapshot guarantee inline so a future refactor doesn't accidentally break it.

---

### Pitfall 11: Storefront sees price change mid-session (UX surprise, not bug)

**Severity:** LOW

**Confirm:** Storefront aggregation re-fetches on navigation (Phase 20 — `getCardsAggregated()`). A customer browsing during the cron window may see a card priced $1.20 on one page and $1.25 on the next. **Not a correctness issue.** Operator's hypothesis confirmed.

**Phase:** No phase action required. If desired, Phase A can add a brief paragraph to the audit page describing "prices are refreshed daily; browsing-time price is informational until checkout snapshots it" — but this is nice-to-have.

---

### Pitfall 12: Audit log row floods (mitigated by prior phases)

**Severity:** LOW

**Confirm:** Phase 14 established the bounded-metadata invariant (`schema.ts:88-110`; `metadata` JSONB defaults to `'{}'`, no unbounded payloads). Phase 15 ships pagination on `/admin/audit`. One row/day from cron + an occasional manual row = ~370 rows/year — orders of magnitude below any concern threshold. Operator's hypothesis confirmed.

**Phase:** No phase action required. The audit page already paginates and indexes by `created_at` (`admin_audit_log_created_at_idx`).

---

### Pitfall 13: Cron handler exceeds 5-minute Vercel cap with cold cache

**Severity:** LOW (back-of-envelope math comfortably under the cap)

**What goes wrong:**
The original prompt assumes "10s or 60s on Hobby" — that's **outdated**. As of 2026-02-27, Vercel docs (`/docs/functions/configuring-functions/duration#duration-limits`) confirm Hobby tier default and max are both **300s (5 minutes)** with fluid compute (enabled by default). So the real risk is: does a cold-cache refresh of all cards fit in 300s?

Math from `src/lib/scryfall.ts:99-109`: 75 cards/batch × 4 concurrent batches × ~250ms gate = ~250ms per "wave" of 300 cards. For 1,400 cards: ~5 waves × 250ms = ~1.25s of gate time. Plus actual HTTP round-trips ~500ms each, plus 4 retries worst-case on transient failures. Realistic worst case: ~30-60s. **Comfortably under the 300s cap** at the operator's collection size.

The math breaks down if the collection grows to ~50,000 cards (operator's collection is ~12,749 rows per Phase 22 perf pin; ~1,400 _unique_ Scryfall IDs since multiple binders contain the same card). At 50k cards = ~667 batches = ~167s gate time + Scryfall RTT = approaching the cap.

**Prevention strategy:**
- Set `export const maxDuration = 300;` (Hobby max) in `src/app/api/admin/cron/refresh-prices/route.ts` — explicit > implicit; surfaces the choice in code review. (Reference: Next.js docs at `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md`.)
- Log the wall-clock duration in the audit-log metadata (`metadata.durationMs`); operator can see trend over time and act before the cap hits.
- DO NOT introduce chunked-invocation complexity for the operator's current scale. Revisit only if `durationMs > 180000` in production logs (rule of thumb: 60% of cap).

**Phase to address:** v1.4 Phase A (cron handler).

---

### Pitfall 14: Vercel may deliver the same cron event twice → double-refresh

**Severity:** LOW (mitigated by Pitfall 4's single-flight lock; idempotent by design)

**Confirm:** Per `/docs/cron-jobs/manage-cron-jobs#cron-jobs-and-idempotency`: "Vercel's event-driven system can occasionally deliver the same cron event more than once. This means your job might run twice for a single scheduled execution. Design your operations to be idempotent."

The price-refresh operation IS idempotent (writing the current Scryfall price twice is the same as writing it once), and the advisory lock from Pitfall 4 prevents the wasteful second run. No additional mitigation needed beyond Pitfall 4's lock.

**Phase to address:** Covered by v1.4 Phase A Pitfall 4 mitigation.

---

### Pitfall 15: Select All button keyboard nav / focus regression

**Severity:** LOW

**What goes wrong:**
Adding Select All / Deselect All buttons near the top of the picker. Tab order today: filename → first binder checkbox → next checkbox → ... → Continue. With new buttons added, the tab order becomes: filename → Select All → Deselect All → first binder checkbox → ... → Continue. That's fine, but if the buttons are implemented with `onClick` only (no keyboard handlers) OR if they steal focus on click and the focus jumps back to the top, the operator's keyboard workflow breaks.

**Why it happens:**
- New buttons are usually added as the visually-prominent affordance without revisiting the tab order intentionally.
- `<button>` defaults are accessible enough that this is usually fine — but a `<div role="button">` or a `<span onClick>` would break it.

**Prevention strategy:**
- Use native `<button type="button">` elements (mirrors the existing Continue button at `import-client.tsx:642`).
- Place them between the header and the first binder row, so tab order is natural top-to-bottom.
- After clicking Select All, focus should stay on the Select All button (default browser behavior). Do NOT explicitly call `.focus()` on anything else.
- Add an axe-core or RTL assertion in the picker test: tab through the rendered output and assert the order is Select All → Deselect All → first checkbox → ... → Continue.

**Phase to address:** v1.4 Phase B (picker UX).

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip the advisory lock; rely on "cron runs at 3 AM, no one's clicking manual then" | Faster phase delivery | First cron-vs-manual race in production corrupts audit log + double-charges Scryfall budget; Pitfall 4 materializes | Never — Vercel docs explicitly require this mitigation |
| Env-gate the cron handler test on `CRON_SECRET` ("we need the real thing to test") | Familiar pattern from `orders.concurrent.test.ts` | Test never runs in CI; next refactor regresses the handler silently — exact Phase 18 → v1.3.5 failure mode | Never. Use `vi.stubEnv` to mock CRON_SECRET; that's what stubEnv exists for |
| Drop the `defaultCheckedFor` memory feature entirely without updating the binder-import-store comment | One-line PR | Future maintainer reads stale D-09/D-10 documentation and re-implements the dead feature; OR the operator loses functionality they relied on | Acceptable only with an explicit comment-block rewrite documenting "Phase v1.4: memory feature removed per X rationale" |
| Write `card.price = null` whenever Scryfall doesn't return the card | "Empty means missing" | Cards drop from "$1.20" to "Price N/A" on every refresh for the 12 known etched/obscure ones; same UX class as Phase 17 etched bug | Never. Always SKIP unknown-to-Scryfall cards; preserve prior price |
| Use the audit-log row as the single-flight signal ("insert a row, if uniqueness violation then bail") | No new mechanism | Race window between SELECT and INSERT; doesn't survive a crash that leaves a stuck "in_progress" row | Acceptable as a **secondary** signal alongside `pg_try_advisory_lock`; never as the primary |
| Skip `maxDuration = 300` because "it'll just use the default" | One fewer line of code | Defaults can change in future Vercel updates; explicit value documents the choice for reviewers | Acceptable but add a comment if omitting |

---

## Integration Gotchas

Common mistakes when connecting to external services (in this app's context).

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Vercel Cron | "I'll just check `process.env.VERCEL` for cron auth" | The only Vercel signal is `user-agent: vercel-cron/1.0` (per docs), but user-agent is spoofable. **CRON_SECRET is the only auth.** |
| Vercel Cron | "Cron will retry on 5xx" | Vercel docs (`/docs/cron-jobs/manage-cron-jobs#cron-job-error-handling`): "Vercel will not retry an invocation if a cron job fails." Idempotency + manual button is the recovery path |
| Vercel Cron | "I'll redirect the cron URL to a normalized path with middleware" | Vercel docs (`/docs/cron-jobs/manage-cron-jobs#cron-jobs-and-redirects`): "Cron jobs do not follow redirects." 3xx = job complete = no work done |
| Scryfall `/cards/collection` | Re-query each card individually in the refresh loop | The batch endpoint at `src/lib/scryfall.ts:226-279` is already correct; reuse `fetchCardsByScryfallIds`, do NOT call `fetchCard` per row |
| Scryfall `/cards/collection` | Trust the in-memory cache for the refresh path | `src/lib/cache.ts` cache is per-instance, lives ~10 min, will return STALE data — the whole point of refresh is to bypass cache. Either bypass the cache module OR invalidate before refresh |
| Neon Postgres advisory lock | Use `pg_advisory_lock` (blocking) | Use `pg_try_advisory_lock` (non-blocking) — the cron should bail immediately if the manual button is mid-run, NOT wait |
| NextAuth session | Use `requireAdmin()` for the cron route | `requireAdmin()` requires a Google OAuth session; the cron caller has no session. Use the Bearer-token check exclusively for the cron route; use `requireAdmin()` for the manual-button POST companion route |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Refresh duration grows linearly with collection | Audit-log `durationMs` creeps from 30s → 120s → 200s over months | Log `durationMs`; alert at 60% of cap (180s) | ~50k unique Scryfall IDs |
| Scryfall 429s during refresh | Audit-log `failed` count nonzero on first run of the day, zero on subsequent | Reuse `acquireGate()` from `scryfall.ts:124-129` — already correct | Anytime concurrent batches exceed gate budget |
| Audit log read query slows down `/admin/health` | Health endpoint p95 latency creeps up | The existing `admin_audit_log_action_idx` index covers `WHERE action LIKE 'price_refresh%'` lookups — confirm via EXPLAIN | If audit log grows past ~50k rows AND action filter isn't used |
| `pg_try_advisory_lock` not released on crash | Subsequent refresh runs all return 409 forever | `pg_advisory_lock` is auto-released at session end on Neon (`neon-http` opens a fresh session per request) — confirms safe; document this in the lock code | Only if app migrates off `neon-http` to a connection pooler with shared sessions |

---

## Security Mistakes

Domain-specific to this app (Viki):

| Mistake | Risk | Prevention |
|---------|------|------------|
| Cron route uses `requireAdmin()` and bypasses CRON_SECRET | Anyone who can guess the route name + has any Google account can refresh prices (only `ADMIN_EMAIL` actually grants access, but the OAuth challenge is the attack surface) | Cron route uses **ONLY** Bearer-token check. Manual button uses **ONLY** `requireAdmin()`. Never both, never neither |
| `CRON_SECRET` length too short ("password123") | Brute-force feasible at Scryfall-rate-limit-protected pace | Vercel docs recommend "at least 16 characters... A password generator, like 1Password, can be used." Generate via `openssl rand -hex 32` |
| Log the Authorization header on bypass attempts ("for debugging") | Secret leaks to log surface; `src/lib/logger.ts` has redaction but it's keyed on known patterns | Never log `request.headers.get("authorization")`. The redaction list at `logger.ts` keys on `password/secret/token/api_key/cookie` — `authorization` may or may not match; do not rely on it |
| Cron handler echoes its config back ("for debugging health page") | `process.env.CRON_SECRET` leaks if endpoint returns it | Follow `getAdminHealthSnapshot()` pattern: response is `"configured"`/`"missing"` literals only |
| Manual "Refresh now" button mounted on the public storefront route | Anyone can DoS the price-refresh budget | Manual button lives under `/admin/*` route subtree which is gated by `requireAdmin()` middleware (already in place) |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| "Refresh now" button gives no feedback after click | Operator clicks 5 times during the 30s wait | Inline progress: button → "Refreshing… (0/1400)" with the same NDJSON-progress pattern as Phase 19 import preview. Button stays disabled while in-flight |
| Storefront shows "last refreshed: 18 hours ago" on the cart page | Pre-cart anxiety: "are prices accurate?" | Don't surface to storefront. `lastPriceRefreshAt` is admin-only on `/admin/health`. Customer-facing prices are point-in-time accurate at checkout (Phase 11 snapshot) |
| Picker opens with all-unchecked + no helper text | Operator stares at empty checkboxes | "Select binders to import. Use Select All to select everything." inline text above the picker — see Pitfall 8 |
| Audit page renders raw `{updated: 1392, unchanged: 0, failed: 8}` | Operator can't tell what "failed" means | Render as "1,392 prices updated · 8 cards not found on Scryfall" — re-use the Phase 21 ScopedImportAuditMetadata-style human formatter |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Cron handler:** Often missing the `process.env.CRON_SECRET` falsy-check branch — verify the handler returns 401 when `CRON_SECRET` env is unset, NOT 200 ("no expected value, so accept any value")
- [ ] **Cron handler:** Often missing test coverage because the file is env-gated — verify `route.test.ts` runs in default `npm test` and uses `vi.stubEnv`
- [ ] **`vercel.json`:** Often missing entirely (file does NOT exist in repo today) — verify `vercel.json` is committed with the `crons` array, AND the schema URL `$schema: https://openapi.vercel.sh/vercel.json` for IDE validation
- [ ] **Picker default:** Often hardcodes `{}` and skips the `binder-import-store` re-architecture — verify the store's `defaultCheckedFor` and `lastSelection` either still work or are explicitly deprecated with a comment update
- [ ] **Will-delete panel:** Often inherits the picker's "default unchecked" without revisiting its own default-checked semantics — verify Phase B explicitly decides what will-delete defaults to in v1.4
- [ ] **`/admin/health`:** Often misses adding `cronSecret` to `envChecks()` AND `lastPriceRefreshAt` to `getAdminHealthSnapshot()` — verify both
- [ ] **Smoke script:** Often doesn't get updated when new health checks land — verify `scripts/smoke-production.ts` checks the new fields
- [ ] **Audit-log metadata:** Often unbounded (a full not-found list of 1,000 card IDs) — verify `metadata` payload is ≤ 4KB per the Phase 14 / 19 invariant; cap `failed[]` list at e.g. 50 entries with a "and N more" counter
- [ ] **Manual button rate limit:** Often missing the ADMIN_BULK rate-limit decorator — verify the manual-trigger POST route uses `rateLimit('ADMIN_BULK')` (10/min already-shipped from Phase 22) so an operator stuck-clicking can't itself DoS Scryfall
- [ ] **Operator-verified live cron invocation:** Often left as "I'll check tomorrow" — verify Phase D VERIFICATION.md includes an explicit operator handoff "watch the Vercel cron dashboard for the first invocation"

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Pitfall 1 (auth bypass exploited) | LOW | 1. Add the Bearer check (1 commit). 2. Rotate `CRON_SECRET` via Vercel dashboard. 3. Redeploy. 4. Inspect `admin_audit_log` for unexpected `price_refresh_started` rows; no data corruption since the operation is idempotent. |
| Pitfall 5 (cards nuked to NULL) | MEDIUM | 1. The previous prices are gone — the audit log captures counts but not individual prior prices. 2. Wait for next Scryfall response with valid prices (next day's cron OR manual button). 3. If urgent, run a one-off Scryfall fetch script and patch `cards.price` for the affected rows. Better: prevent via Pitfall 5 mitigation. |
| Pitfall 6 (CRON_SECRET missing in prod) | LOW | 1. Set in Vercel project dashboard. 2. Redeploy (env changes require redeploy on Vercel). 3. Hit `/admin/health` to verify `cronSecret: configured`. 4. Wait for next cron window OR click manual button to backfill. |
| Pitfall 4 (cron-vs-manual race already happened) | LOW | 1. Identify the offending audit-log rows by overlapping timestamps. 2. Card prices are consistent because both writes were the same Scryfall data. 3. Re-derive single source of truth for `lastPriceRefreshAt` (most recent `price_refresh_completed`). 4. Add the advisory lock. |
| Pitfall 3 (picker memory regression shipped) | MEDIUM | 1. Operators have already lost their `lastSelection` localStorage state OR it's now misinterpreted. 2. Hot-fix the picker to respect the old store shape, OR add a one-time migration that clears `viki-binder-import-selection`. 3. Bump `BINDER_IMPORT_STORE_VERSION` from 1 → 2 with a migrate hook that drops the field. |

---

## Pitfall-to-Phase Mapping

How v1.4 phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 — Cron auth bypass | v1.4 Phase A (cron handler) | Tier-1 test: 401 with no header, 401 with wrong, 200 with correct |
| 2 — Env-gated test regression (v1.3.5 repeat) | v1.4 Phase A + Phase D | Phase A: file header "NOT env-gated"; Phase D: meta-test or grep for `describe.skip` |
| 3 — Picker memory contract broken | v1.4 Phase B (picker UX) | CONTEXT.md explicitly chooses Option A/B/C; tests cover fresh + returning operator |
| 4 — Cron + manual race | v1.4 Phase A (cron handler) | Tier-1 test: mock advisory lock returning false → 409 |
| 5 — Scryfall partial failure → NULL | v1.4 Phase A (cron handler) | Tier-1 test: 5/100 cards missing from mock → those 5 retain old price |
| 6 — CRON_SECRET silently missing | v1.4 Phase C (health surface) | Existing `route.test.ts` extended to assert `cronSecret` field present + correct |
| 7 — `next dev` doesn't fire cron | v1.4 Phase D (hardening/UAT) | Operator handoff item in VERIFICATION.md mirroring Phase 22 UAT pattern |
| 8 — Empty-selection commit | v1.4 Phase B (picker UX) | Test: helper text visible when count=0; button disabled with aria-describedby |
| 9 — Hobby cron drift | v1.4 Phase A (cron handler) | SUMMARY.md cites the drift; `vercel.json` has a meaningful hour choice |
| 10/11 — Mid-flight price changes | v1.4 Phase A (confirm only) | SUMMARY.md cites Phase 11 snapshot invariant and Phase 20 navigation re-fetch |
| 12 — Audit log growth | (Already mitigated by Phase 14 + 15) | No phase action |
| 13 — Function timeout | v1.4 Phase A (cron handler) | Explicit `maxDuration = 300`; log durationMs in audit metadata |
| 14 — Cron event delivered twice | v1.4 Phase A (covered by Pitfall 4) | Same test as Pitfall 4 |
| 15 — Keyboard nav | v1.4 Phase B (picker UX) | Test: tab order Select All → Deselect All → first checkbox → ... |

---

## Sources

- **Vercel Cron Jobs main page** (`/docs/cron-jobs`, last updated 2025-06-25) — HIGH confidence, official source. Cron expression rules, GET-only invocation, user-agent.
- **Vercel Managing Cron Jobs** (`/docs/cron-jobs/manage-cron-jobs`, last updated 2026-02-27) — HIGH. CRON_SECRET pattern verbatim, concurrency control, idempotency, no retries, no redirects, no local dev, Hobby restrictions.
- **Vercel Function Duration** (`/docs/functions/configuring-functions/duration`, last updated 2026-02-27) — HIGH. Hobby tier 300s default and max with fluid compute (the prompt's "10s/60s" assumption is outdated as of 2026).
- **Next.js 16 maxDuration route segment** (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md`) — HIGH. `export const maxDuration = 5` pattern; Next 16.2.2 confirmed in `package.json`.
- **`.planning/todos/pending/01-phase-18-concurrent-proof.md`** — Project-internal incident record for env-gated test regression (Phase 18 → v1.3.5 hotfix). HIGH.
- **`.planning/RETROSPECTIVE.md`** — Project-internal lesson "5x flake check requires real DB credentials... permanent operator handoff" — confirms the env-gated CI gap is well-known internally. HIGH.
- **`src/app/admin/import/_components/binder-picker.tsx`**, **`src/app/admin/import/_components/import-client.tsx`**, **`src/lib/store/binder-import-store.ts`** — read directly to confirm the current default-checked memory contract (Pitfall 3). HIGH.
- **`src/app/api/admin/health/route.ts`**, **`src/db/admin-health.ts`** — read directly for the health-surface extension shape (Pitfall 6). HIGH.
- **`src/lib/scryfall.ts`** — read directly for the batch endpoint shape, gate, and rate-limit threshold (Pitfalls 5, 13). HIGH.

---

*Pitfalls research for: v1.4 cron + picker UX addition to existing Viki app*
*Researched: 2026-05-20*
