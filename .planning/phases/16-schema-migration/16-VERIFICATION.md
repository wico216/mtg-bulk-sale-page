# Phase 16 — Verification

**Phase:** 16-Schema & Migration
**Plan:** 16-01
**Date:** 2026-05-11
**Executor:** Claude Opus 4.7 (1M context)
**Status:** `human_needed`

---

## Status: `human_needed`

The code-side of Phase 16 is complete and all repo gates are green. The
remaining verification (Neon-branch dry-run, live-on-branch, idempotency
re-run, production cutover) requires Neon CLI / dashboard access that the
autonomous executor does not have. The full operator runbook is embedded in
`16-01-SUMMARY.md` § "Operator handoff runbook".

This phase ships the script + the verified rehearsal harness + the schema
shape, NOT the production migration itself. Production cutover is the
operator's explicit step (D-11 step 4).

---

## Executor-verified items (passed)

| # | Item | Method | Result |
|---|------|--------|--------|
| 1 | Drizzle schema updated to post-migration shape (`finishEnum` + `cards.binder` + `cards.finish` + `orderItems.binder` + `cards_quantity_check` CHECK; `cards.foil` dropped) | `npx vitest run src/db/__tests__/schema.test.ts` | PASS — all schema invariant tests green; new pins for finishEnum, binder, finish, no-foil, CHECK constraint, orderItems.binder. |
| 2 | Migration script TypeScript compiles + Path A typing holds | `npx tsc --noEmit` | PASS — green; `_batchProbe` proves `db.batch([db.execute(sql\`...\`), ...])` typechecks under `drizzle-orm@0.45.2 / @neondatabase/serverless@1.0.2`. |
| 3 | Pre-flight + statement-builder + summary contract pinned by tests | `npx vitest run scripts/__tests__/migrate-v1.3-binder.test.ts` | PASS — 21/21 tests green covering all 4 pre-flight branches (a/b/c/d), 11-step batch ordering, summary template (live + dry-run + loss-detected), `--help`, unknown-flag rejection, `--dry-run` "no `db.batch` call" guarantee, live-run "exactly one `db.batch` with 11 statements". |
| 4 | Full vitest suite green (regression check) | `npx vitest run` | PASS — 300/300 tests in 29 files (was 290/290 in 28 files). |
| 5 | Next.js build succeeds | `npm run build` | PASS — all 24 routes built, no errors. |
| 6 | No whitespace damage | `git diff --check` (and `git diff --cached --check`) | PASS — clean. |
| 7 | ESLint clean on touched files | `npx eslint <files>` | PASS — 0 errors / 0 warnings introduced by this phase. (One pre-existing `(columns as any)` warning in schema.test.ts at line 89 was previously line 50, not introduced here.) |
| 8 | `--help` works without `DATABASE_URL` and prints no secrets | `npm run migrate:v1.3 -- --help` | PASS — usage printed, exit 0, no env-var values echoed. |
| 9 | Missing-`DATABASE_URL` guard | `DATABASE_URL='' npm run migrate:v1.3:dry-run` | PASS — exit 1 with `Error: DATABASE_URL is not set. Source .env.local or export it before running.` |
| 10 | `package.json` scripts wired | `cat package.json` | PASS — `"migrate:v1.3"` and `"migrate:v1.3:dry-run"` present. |
| 11 | Apply path decision documented in script header (D-03) | `head scripts/migrate-v1.3-binder.ts` | PASS — Path A justification + typing evidence inline. |
| 12 | Neon PITR rollback recipe documented in script header (D-17) | `head scripts/migrate-v1.3-binder.ts` | PASS — full recipe + Neon doc URL embedded. |
| 13 | 11-step batch ordering documented in script header | `head scripts/migrate-v1.3-binder.ts` | PASS — exact order matches 16-CONTEXT `<specifics>`. |

---

## Outstanding human-verification items (`human_needed`)

These cannot be verified by the autonomous executor. The full runbook is in
`16-01-SUMMARY.md` § "Operator handoff runbook". Brief checklist for the
operator:

| # | Item | Method | Reason executor cannot run |
|---|------|--------|----------------------------|
| H-1 | Pre-flight rejection on a post-migration DB (idempotency proof) | `DATABASE_URL=<branch-url> npm run migrate:v1.3` (second run) → expect exit 1 with `Pre-flight (a) FAILED: ... cards.id row(s) already end in '-unsorted'` | Requires Neon branch with the migration applied. |
| H-2 | Pre-flight rejection on a DB seeded with a `-unsorted`-suffixed row | seed `lea-1-foil-near_mint-unsorted` → run script → exit 1 with that id in the message | Requires writable Neon branch + seed access. |
| H-3 | Dry-run on a clean (pre-v1.3) Neon branch | `DATABASE_URL=<branch-url> npm run migrate:v1.3:dry-run` → prints would-be statements + dry-run summary; nothing written | Requires Neon branch URL. |
| H-4 | Live-on-branch run | `DATABASE_URL=<branch-url> npm run migrate:v1.3` → structured summary matches D-14; sample ids 5-segment + `-unsorted`; finish counts sum to total; CHECK present; `order_items.binder` populated; zero new mismatches | Requires Neon branch URL. |
| H-5 | Production cutover (D-11 step 4) | `DATABASE_URL=<production-url> npm run migrate:v1.3` → eyeball summary | The script does NOT auto-run; D-11/D-12 require manual operator approval per the project's established pattern. |
| H-6 | Vercel deploy of v1.3 application code (D-11 step 7) | Vercel dashboard "Promote to Production" | The Vercel dashboard is operator-only. |

---

## Decision compliance check (D-01..D-17)

All 17 locked decisions from `16-CONTEXT.md` are honored. Spot summary:

| Decision | Honored? | Evidence |
|----------|----------|----------|
| D-01 (custom Drizzle migration via script) | yes | `scripts/migrate-v1.3-binder.ts` is a `tsx`-runnable custom script; no `drizzle-kit generate` artifact added. |
| D-02 (single atomic `db.batch`) | yes | `buildBatchStatements()` returns 11 ops in one batch; `main()` calls `db.batch(...)` exactly once on the live path (test "live run calls db.batch exactly once with 11 statements" pins this). |
| D-03 (typing spike) | yes | Path A confirmed; documented in script header + 16-01-SUMMARY.md. |
| D-04 (3 pre-flight assertions) | yes | `runPreflights()` implements (a), (b), (c) per the plan; tests pin all four branches. |
| D-05 (5-segment id) | yes | `UPDATE cards SET id = set_code || '-' || collector_number || '-' || finish::text || '-' || condition || '-' || binder` — pinned by the "id-rewrite UPDATE produces exactly 5 segments" test. |
| D-06 (`cards.binder` default 'unsorted') | yes | `text("binder").notNull().default("unsorted")` in schema + `ALTER TABLE cards ADD COLUMN binder text NOT NULL DEFAULT 'unsorted'` in batch. |
| D-07 (finish enum + drop foil) | yes | `finishEnum = pgEnum("finish", ["normal","foil","etched"])`; `foil` removed; backfill statement wired. |
| D-08 (CHECK quantity >= 0) | yes | `check("cards_quantity_check", sql\`...\`)` in schema + `ALTER TABLE cards ADD CONSTRAINT cards_quantity_check CHECK (quantity >= 0)` in batch; pinned by `getTableConfig(cards).checks` test. |
| D-09 (`order_items.binder`) | yes | Column added in schema + batch; pinned by orderItems schema test. |
| D-10 (Phase 19 picker default-unchecked for unsorted) | n/a | Decision applies to Phase 19; Phase 16 only ensures `binder='unsorted'` rows exist. ✓ |
| D-11 (manual local run, dry-run gate, then prod, then deploy) | yes | `--help` + script header + SUMMARY runbook all reflect this exact sequence; no Vercel hook added. |
| D-12 (no auto-run / no console paste) | yes | No `vercel-build` or `postbuild` hook added; no `.sql` file generated. |
| D-13 (`migrate:v1.3` + `migrate:v1.3:dry-run` scripts) | yes | Both present in `package.json`. |
| D-14 (structured terminal summary) | yes | `formatSummary()` produces the D-14 template; pinned by 8 separate tests covering header, schema-changes block, data-migration block, constraints block, sample-ids block, pre-flights line, next-step line, dry-run banner, loss-detected banner. |
| D-15 (no /admin/health change, no smoke change) | yes | `src/app/admin/health/` and `scripts/smoke-production.ts` untouched in this phase. |
| D-16 (no `pg_dump`; rely on Neon branch + PITR) | yes | No backup file added; PITR is the documented rollback. |
| D-17 (PITR recipe in script header) | yes | Header comment includes the 5-step recipe + Neon docs URL. |

---

## Success criteria status (from PLAN.md `<success_criteria>`)

| Criterion | Status |
|-----------|--------|
| BIND-01: cards composite ID 5-segment ending in `-unsorted` after migration | **code+tests ready; needs Neon-branch live run to verify against real data (H-4)** |
| BIND-02: every cards row carries `binder='unsorted'`; storefront/cart/checkout still load | **code+tests ready; storefront unchanged via `rowToCard` shim; needs H-4 + Vercel deploy spot check (H-6)** |
| BIND-03: `order_items.binder text NOT NULL DEFAULT 'unsorted'` exists + populated | **code+tests ready; needs H-4 to verify against real data** |
| BIND-04: `cards.quantity >= 0` CHECK present; manual negative attempt rejects | **code+tests ready; CHECK pinned by `getTableConfig().checks` test; needs H-4 + manual `UPDATE cards SET quantity=-1 WHERE id=...` against branch to verify the constraint actually fires** |
| FIN-01: `cards.finish` enum backfilled from `foil` boolean; foil column dropped | **code+tests ready; needs H-4 to verify backfill counts on real data** |
| Migration refuses second run | **code+tests ready; needs H-1 to verify against a real post-migration DB** |
| Neon-branch dry-run produces zero new `order_items.cardId` mismatches | **code+tests ready; needs H-3/H-4 to verify** |
| No down migration; PITR recipe in header | **DONE** (verified by reading `scripts/migrate-v1.3-binder.ts` header) |
| Terminal summary matches D-14 template | **DONE** (8 tests pin the template; live-run output content verified by H-4) |

---

## Sign-off

- [x] Executor work complete and committed (`01145a2`, `249a793`, `1768c83`).
- [x] Repo gates green (`tsc`, `vitest` 300/300, `build`, `git diff --check`).
- [ ] Operator-verified: Neon-branch dry-run + live-on-branch + idempotency
      re-run (H-1..H-4).
- [ ] Operator-verified: production cutover (H-5).
- [ ] Operator-verified: Vercel deploy of v1.3 application code (H-6).

When the operator completes H-1..H-6, append a "Verified by operator" section
below with timestamps, branch names (redact connection strings), and the
captured terminal output excerpts (D-14 summary).

---

*See `16-01-SUMMARY.md` for the full operator runbook + apply-path decision +
deviations + cutover handoff.*
