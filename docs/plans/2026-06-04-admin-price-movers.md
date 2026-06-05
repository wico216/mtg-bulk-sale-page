# Admin Price Movers Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build an authenticated Admin → Price Movers report showing in-stock cards whose latest tracked price change went up.

**Architecture:** Add a durable `card_price_snapshots` table shape plus lazy runtime table creation for deploy safety, record price-change snapshots during the existing Scryfall price refresh, query latest positive movers joined to current inventory, and render a read-only admin page at `/admin/prices`. Use E2E fixtures for deterministic admin visual tests.

**Tech Stack:** Next.js App Router, React Server Components, Drizzle/Neon SQL, Vitest, Testing Library, Playwright fixtures.

---

## Scope

- Build read-only admin report only.
- Record changed prices during refresh so future reports have data.
- Keep public storefront untouched.
- Do not add alerts, acknowledge/hide, or charting in this slice.

## Safety constraints

- Admin-only route; E2E fixture bypass must remain disabled in production.
- Do not leak binders/source boxes to public pages.
- Use `CREATE TABLE IF NOT EXISTS` before writes/reads so production does not require a manual migration before the feature becomes safe.
- Keep price refresh audit metadata shape unchanged because existing tests/health/audit rely on six locked scalar keys.

## Tasks

### Task 1: RED — price snapshot schema/report tests

- Add schema test expecting `cardPriceSnapshots` with card ID, previous/new price cents, source trigger, actor email, captured timestamp.
- Add DB report tests expecting latest positive changes only, sorted by dollar gain, with inventory quantity/source box included.

### Task 2: GREEN — schema and report query

- Add `cardPriceSnapshots` to `src/db/schema.ts`.
- Create `src/db/price-movers.ts` with lazy table creation and `getPriceMoversReport()`.

### Task 3: RED/GREEN — refresh integration

- Extend `src/lib/__tests__/price-refresh.test.ts` to expect changed rows insert into `card_price_snapshots` through an update+insert CTE.
- Update `runPriceRefresh()` to ensure the snapshot table and record only actual changed rows while preserving existing counters/audit shape.

### Task 4: RED/GREEN — admin UI

- Add `PriceMoversReportView` component tests.
- Create `/admin/prices` page, component, fixture data, and Admin nav item.

### Task 5: Verification

Run:

```bash
npm test -- --run src/db/__tests__/schema.test.ts src/db/__tests__/price-movers.test.ts src/lib/__tests__/price-refresh.test.ts src/app/admin/prices/_components/__tests__/price-movers-report-view.test.tsx
npm test
npx tsc --noEmit
npm run build
PLAYWRIGHT_PORT=3202 CI=1 npx playwright test e2e/admin-responsive.spec.ts --project=chromium --reporter=list --workers=1 -g "Price Movers|mobile admin responsive"
```
