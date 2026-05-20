# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.4 — Import UX & Price Refresh

**Shipped:** 2026-05-20
**Phases:** 1 (Phase 23) | **Plans:** 2 | **Commits:** 32 + 4 follow-up | **Code:** +8,260 / −2,331 across 46 files | **Tests:** 540 → 545 passing + 2 skipped
**Timeline:** ~5.5 hours wall-clock from milestone bootstrap (2026-05-20 13:34 ET) to shipped-and-verified-on-prod (19:13 ET), all in one session

### What Was Built

- **Plan 23-01 — Daily Price Refresh:** Vercel cron at `0 9 * * *` UTC + admin `Refresh now` button on `/admin/health` both call a shared `runPriceRefresh({trigger, actorEmail?})` server-only service. Row-based lease in `price_refresh_lock` table (CR-01 fix — replaced broken `pg_try_advisory_lock` design after REVIEW found the neon-http session-scoped lock was a no-op). `timingSafeEqual` Bearer-token comparison (WR-01). Audit metadata distinguishes `updated / unchanged / failed (not_found) / skipped (no scryfallId)`. `lastPriceRefreshAt` tile + `cronSecret: configured | missing` literal on `/admin/health` (D-13: top-level `ok=false` flips on missing secret). Tier-1 unit tests default-run with literal `"NOT env-gated"` header (v1.3.5 lesson encoded).
- **Plan 23-02 — Import Picker UX:** Explicit opt-in binder selection. Dropped `defaultCheckedFor` memory from the zustand store (Option A per D-05). Select all / Deselect all native buttons in picker header with `onBulkSet(names, checked)` single-render callback (D-15 — avoids N renders). Picker opens UNCHECKED every session. Disabled-Continue helper text via `aria-describedby`. Will-delete amber panel's v1.3 default-CHECKED behavior intentionally preserved (separate component, separate concern).

### What Worked

- **One-day end-to-end ship including human UAT against live prod DB**: bootstrap → research → plan → execute (with intentional sequential mode after Wave-1 worktree path-drift surfaced) → code review + auto-fix → verification → 4-item human UAT → prod deploy → bug discovery + fix + backfill → first real refresh confirmation, all within ~5.5h wall-clock.
- **Discovering the `cardToRow` bug after the prod push (not before)** was, paradoxically, the right outcome. The unit tests + verification pipeline NEVER would have caught it — `cardToRow` was test-covered but the tests asserted `expect(row.scryfallId).toBeNull()` when no input field was provided, which silently codified the bug. Only end-to-end verification with a snapshot of `cards.scryfall_id IS NULL` count (2353/2353) made the smell obvious. **Lesson:** post-deploy "did the data move?" smoke checks catch bugs that unit + integration tests can't.
- **Cross-cutting constraints listed at the TOP of STATE.md** ("UPDATE by `cards.id` not `scryfall_id`", "row-based lease not advisory lock", "cents not dollars", etc.) — these were enforced through code review and were the right shape: short, declarative, paired with the prior incident they're protecting against (e.g. "v1.2 etched-mispricing bug"). They survived contact with reality unchanged.
- **The audit-row contract** (`{trigger, updated, unchanged, failed, skipped, durationMs}`) was a small data structure but enabled fast post-refresh diagnosis. Looking at one audit row tells you whether your data is healthy without any client-side instrumentation.

### What Was Inefficient

- **`gsd-sdk query phase.complete <n> --dry-run` flag was ignored** by the SDK and applied destructive STATE.md changes (flattened narrative; set `completed_plans: 47` — a cross-milestone-aggregate bug). I had to revert and surgically re-apply. The same SDK's `milestone.complete` later ran more cleanly. **Lesson:** before trusting SDK dry-run flags, snapshot first.
- **`gsd-sdk query audit-open` reported 19 "open items" but ~all were carry-forwards or scanner false positives.** Quick tasks listed as "missing" despite STATE.md "Quick Tasks Completed" table showing all done with commit hashes. UAT files with `status: passed` and 0 open scenarios still counted as gaps. Acknowledging required dedup against the existing v1.3 Deferred Items table. **Lesson:** the audit-open scanner needs awareness of carry-forward state to avoid scaring future operators.
- **`vercel.json` cron registers automatically on each `vercel build`, but env vars on the running deployment are immutable** — adding `CRON_SECRET` after the initial deploy required a redeploy before the running cron could see it. Worth surfacing this in the operator runbook because the first-instinct expectation is "I set the env var, it should work."
- **`scripts/backfill-scryfall-ids.ts` passed `npx tsx` locally but failed `next build`'s strict TS pass** with `Type 'Printing' does not satisfy the constraint 'Record<string, unknown>'`. tsx is a runtime runner, not a strict typechecker. Required a follow-up 1-line fix commit. **Lesson for future migration-style scripts:** `npx tsc --noEmit` before pushing.

### Patterns Established

- **Hardcoded `null` / default values in shared mappers are a smell.** The `cardToRow` bug originated from a shared function written for one input shape (cards.json seed, no scryfallId) being reused for another (Manabox CSV, has scryfallId) without updating the mapping. Prefer `card.field ?? null` over literal `null` so the field is transparent through the mapper. Recorded in STATE.md Blockers/Concerns for pattern-mining.
- **One-shot backfill scripts pair with one-line bug fixes.** When fixing a write-path bug that left dirty data behind, the same PR should include the backfill script (or it should land as a clearly-named companion commit). The script's dry-run output + 100% match rate is the proof that the fix is safe to deploy.
- **Pre-flight DB snapshot for any destructive `gsd-sdk` operation.** Cheap (~1s `cp`) and saved the session twice (`phase.complete` STATE.md narrative flatten + `milestone.complete` minor field changes I wanted to verify).

### Key Lessons

1. **Post-deploy smoke checks find bugs that the verification pipeline can't.** Test suites + verification docs + code review all passed, but a `SELECT count(*) WHERE scryfall_id IS NULL` against prod surfaced the cardToRow bug in seconds. Add "post-deploy data-shape spot-check" as an explicit verification step for write-path features.
2. **Trust SDK queries that match a documented contract; treat SDK queries with destructive side effects (phase.complete, milestone.complete) as needing snapshot + verify.**
3. **`vercel env add <KEY> production` doesn't propagate to existing deployments.** Operator runbook should say "set secret → redeploy → verify" not just "set secret".
4. **Manabox CSVs do include Scryfall ID.** Future inventory-mutation features can assume `scryfall_id IS NOT NULL` after this milestone (modulo any imports from non-Manabox sources).
5. **Single-session full-stack milestones work when scope is small (≤2 plans, ≤16 requirements).** v1.4's 5.5h-from-bootstrap-to-verified-on-prod was viable because Phase 23 was narrowly scoped. Multi-phase milestones (v1.3 was 7 phases) need autonomous-run support, which we used last time.

### Cost Observations

- Session: 1 continuous (no /clear between phases)
- Model mix: predominantly Opus 4.7 (1M context) throughout
- Notable: the single-session run enabled the live UAT walkthrough to flow directly into the bug-fix + backfill arc without context handoff overhead. Splitting milestones across sessions would have lost the post-deploy verification momentum.

---

## Milestone: v1.3 — Binder-Aware Inventory & Pick Workflow

**Shipped:** 2026-05-11
**Phases:** 7 (16-22) | **Plans:** 11 | **Commits:** 73 | **Code:** +36,666 / −1,344 across 136 files | **Tests:** 300 → 464 passing + 2 env-gated
**Timeline:** ~5 hours autonomous run from milestone bootstrap to merge-ready (single session)

### What Was Built

- **Schema migration with safety net** (Phase 16) — 5-segment composite id `{setCode}-{collectorNumber}-{finish}-{condition}-{binder}`, finish enum (normal/foil/etched), CHECK (quantity >= 0), one-shot `db.batch` atomic apply, three idempotency pre-flights, structured terminal summary, Neon PITR rollback recipe
- **Etched bug fix** (Phase 17) — 11 known etched cards in operator's collection (Wrath of God, Cultist of the Absolute, Master Chef, Tor Wauki the Younger, Jasmine Boreal of the Seven, +6) were silently mispriced as `normal` in v1.2; now correctly priced via Scryfall `usd_etched`
- **Multi-binder allocator** (Phase 18) — single 11-CTE SQL chain inside placeCheckoutOrder; smallest-first + lex tiebreaker; FOR UPDATE OF cards on aggregated key; one order_items row per binder source with binder snapshotted; multi-binder concurrent-proof harness
- **Two-stage NDJSON binder picker** (Phase 19) — parse → emit binders → operator selects → enrichment runs only on selected; hand-rolled checkbox list mirroring filter-rail; remembered selection via zustand persist; will-delete panel default-checked; inline destructive confirm with typed REPLACE
- **Storefront aggregation + privacy type split** (Phase 20) — getCardsAggregated GROUP BY returns AdminCard[]; PublicCard/AdminCard/PublicOrderItem/PublicOrderData split makes binder leak a compile error; per-route invariant tests; cart reconciliation extends Phase 10-03 useEffect (NOT zustand migrate); one-time informational toast
- **Admin binder visibility** (Phase 21) — inventory binder column + filter dropdown + URL persistence; "Breakdown by binder" dashboard tile; order detail [binder] pill from order_items snapshot; audit page expander for ScopedImportAuditMetadata
- **Hardening** (Phase 22) — D-DOS-01 resolved via ADMIN_BULK rate-limit on /api/admin/import/preview; STRIDE delta records I-DISC-05 binder-leak (Low, resolved); perf pin (12,749 rows in 38ms; 50x under 2s); 5-scenario UAT runbook

### What Worked

- **Discuss-all-phases-first batched the design work into one coherent thinking session** — pipeline parallelism per the workflow; CONTEXT.md for all 7 phases committed before any code execution; kept the design space in working memory throughout planning
- **Auto-mode after the user toggle** — Claude made calls on routine gray areas (e.g., "rip out card.foil cleanly", "lowercase canonical normalized binder names"); user only needed to confirm milestone-level direction
- **Background-agent dispatching for plan + execute** — main context stayed lean enough to drive 7 phases × 11 plans in a single conversation; each agent returned a 300-500 word summary that fit cleanly into the orchestrator's working memory
- **Type-split caught a real bug** — the Phase 20 PublicCard/AdminCard discipline FORCED the executor to spot a CheckoutResponse.order.items[].binder leak that was sitting in the Phase 18 output. PublicOrderItem strip shipped in the same commit. Compile-time privacy guarantee paid off immediately.
- **Planner caught a CONTEXT math error** — Phase 18 D-07 had an arithmetic impossibility (seed total=4 can't produce SUM=0 after one winner takes 3); the planner implemented BOTH variants (as-written + corrected) for full coverage. Better than silent wrongness.
- **Research-recommended phase ordering refined the build** — STATE.md execution_order (16 → 17 → 20 → 19 → 18 → 21 → 22) shipped lower-risk read-side before write-side; integration checker's eventual numeric-order verdict still came out clean

### What Was Inefficient

- **The Skill tool was denied in subagents.** Every spawned agent fell back to manual execution of the corresponding workflow ("read CONTEXT, follow plan, commit"). Output quality was equivalent but the indirection added one layer of "agent interpreting workflow text" that direct skill invocation would skip
- **CONTEXT-time gray areas leaked into plan-time discoveries** — Phase 17's plan grew to cover filter-rail/filter-store extension (3-value finish facet) that the CONTEXT didn't enumerate; happened in 2-3 phases. CONTEXT writers should grep for affected files more aggressively
- **`gsd-sdk query milestone.complete` extracts wrong fields for "accomplishments"** (same as v1.2) — pulls `Status:` / `Plan:` / `Wave:` from random SUMMARY headings. Manual rewrite of MILESTONES.md needed every time
- **`roadmap.analyze` doesn't recurse into `<details>` blocks** — discovered v1.3 phase listing wasn't being parsed; had to surface the in-progress milestone outside `<details>` for the autonomous workflow to find phases. Re-collapsed it after milestone close.
- **5x flake check requires real DB credentials** — the multi-binder concurrent-proof tests are env-gated on TEST_DATABASE_URL; the executor can't provision a Neon test branch from inside the autonomous run; permanent operator handoff
- **Auto-mode skipped per-phase code-review** — context budget vs thoroughness tradeoff; the audit + integration check at milestone end caught the missing pieces, but a per-phase review pass would have surfaced things sooner

### Patterns Established

- **`PublicCard` / `AdminCard` / `PublicOrderItem` type split for compile-time leak prevention** — any future privacy-sensitive field gets its own type-split. Cheaper than runtime stripping; impossible to silently bypass.
- **Single SQL CTE chain for atomic multi-row decisions on neon-http** — Phase 18 allocator pattern; lock by aggregated key with FOR UPDATE; window functions for running supply; LEAST/GREATEST for take-quantity. Reusable for any "pick rows, decrement, write history" flow.
- **Two-stage NDJSON contract** — parse → emit summary → operator selects → operate on subset. Saves expensive operations on un-selected data; reusable for any heavy admin workflow with selection
- **Per-route invariant tests assert serialized response shape** — `JSON.stringify(response).includes('private_field') === false`. Compile-time + runtime defense in depth.
- **CONTEXT.md as de-facto UI-SPEC for small UI phases** — when the picker UI is well-specified in CONTEXT (D-03..D-08), the plan/execute chain doesn't need a separate UI-SPEC step. Saves a workflow round-trip.
- **`gsd-sdk query commit` doesn't recognize `--dry-run`** — treats it as part of the message; the Phase 17 executor caught a self-introduced surprise commit and soft-reset cleanly. Skill should validate flags.

### Key Lessons

1. **Privacy guarantees that live in TypeScript are stronger than runtime tests.** The PublicCard/AdminCard type split caught a Phase 18 leak the runtime invariant tests would have caught later. Compile errors are immediate; test failures are after-the-fact.
2. **Math-check the spec before relying on it.** D-07's seed totals didn't add up; the planner caught it. CONTEXT writers should hand-trace at least one fixture per requirement.
3. **Background-agent dispatching is the right pattern for long autonomous runs.** Plan + execute as Agent calls keeps the orchestrator's context for design decisions only; the heavy implementation context lives in isolation.
4. **Don't trust the CLI's accomplishments extraction.** `milestone.complete` produces garbage for the MILESTONES.md key accomplishments; always rewrite by hand from SUMMARY one-liners.
5. **Operator-only verification items (Neon dry-run, TEST_DATABASE_URL provisioning, live UAT) are normal.** Document them in deferred items + audit; don't try to fake them inside the autonomous run.

### Cost Observations

- Model mix: opus on planning + research + audit; opus on execute (per user's max-effort toggle); opus on synthesizer (override of sonnet default)
- 73 commits / 11 plans = ~6.6 commits per plan including review/fix work
- Heaviest phases: Phase 19 (15 tasks across 2 plans, full client+server stack), Phase 20 (16 tasks, type split + cart migration)
- Notable: 7 phase plans + 7 phase executes ran as background agents in ~5 hours wall time. Pipeline parallelism (discuss next phase while current builds) saved real time

---

## Milestone: v1.2 — Store Operations & Hardening

**Shipped:** 2026-05-11
**Phases:** 3 (13, 14, 15) | **Plans:** 6 | **Commits:** 39 | **Code:** +5,423 / −130 across 38 files

### What Was Built

- **Admin order workflow** (Phase 13) — status transitions including cancel; search/filter on ref/name/email/status; private internal notes; cancellation with explicit optional inventory restore
- **Inventory audit trail** (Phase 14) — `admin_audit_log` covering 8 mutation surfaces; first-class `import_history` for CSV commits; admin-visible `/admin/audit` page
- **Production hardening** (Phase 15) — sliding-window rate-limit (CHECKOUT 10/min, ADMIN_MUTATION 60/min, ADMIN_BULK 20/min) on Postgres + structured logger with deep redaction; `/admin/health` page + JSON endpoint; `npm run smoke:production`; STRIDE security review
- **Live deployment** verified via 3/3 human UAT against `wikos-spellbinder.vercel.app`

### What Worked

- **Three-phase scope was right-sized** — each phase shipped in 1-2 days of execution after planning; no phase had to be inserted as decimal mid-flight
- **TDD RED→GREEN gate held throughout Phase 15** — every primitive (rate-limit, logger, health snapshot) had a failing test before implementation, which caught the "blocked attempts must NOT extend the window" invariant before production
- **Code review fix-loop on Phase 15 was productive** — 14 fix commits across iter-1 and iter-2 cleaned up 0 Critical / 0 Warning / 4 Info findings; the loop converged because each fix was atomic and pinned by a regression test
- **Single batched `db.batch([...])` for import commit** (Phase 14-02 + 15) kept cards + audit + import_history atomic without introducing a second transaction abstraction
- **Live deployment verification (15-HUMAN-UAT.md)** caught real cross-instance behavior the unit tests can't — Postgres rate-limit store sharing across Vercel function instances was confirmed by the rate-limit hammer

### What Was Inefficient

- **Missing VERIFICATION.md for Phases 13 + 14** — verification work was done thoroughly (browser proof, DB proof, full test runs documented in SUMMARY.md) but the formal verifier-produced report file was never written. Closing the milestone surfaced this as tech debt requiring retroactive `/gsd:verify-work` if the artifact gap matters.
- **Worktree-vs-main path collisions** (Phase 15-01 + 15-02 both hit) — Write tool calls with absolute paths starting at the main repo collapsed there instead of staying in the worktree. The path-safety guard caught it both times but each instance cost a re-derive + `mv` cycle.
- **`server-only` mock convention** had to be re-declared in two new test files (15-01) — should be a vitest setup file or a shared mock instead of per-file repetition.
- **15-VERIFICATION.md status drift** — `human_needed` was set when 3 live items routed to humans, but no automation flipped it back to `passed` after 15-HUMAN-UAT.md completed. The milestone audit had to do the manual flip.
- **`requirements:` vs `requirements-completed:` frontmatter divergence** — Phase 13 + 14 plans use `requirements:`, Phase 15 plans omit it entirely, and the SDK extractor only reads `requirements-completed:`. None of the 6 v1.2 plans show up in `gsd-sdk query summary-extract --fields requirements_completed`.

### Patterns Established

- **Rate-limit AFTER `requireAdmin()` on admin routes; BEFORE body-parse on public routes** — pinned by regression specs (`rate-limit runs AFTER auth so an unauthenticated caller still sees 401, not 429`). This ordering should be a project-wide invariant for any future write surface.
- **Reserved API contract slots over feature flags** — `notificationFailuresLast24h: null` with explicit UI label "Unknown — log drain not yet wired" beats a feature flag because the consumer contract stays stable.
- **Audit metadata sanitization at insert time, not at log time** — bounded depth/keys/length applied before `INSERT INTO admin_audit_log`, so a downstream log drain or admin viewer never has to re-sanitize.
- **STRIDE security review per milestone with named follow-up owners** — every deferred item (S-01, D-DOS-01..03, I-DISC-03) names its remediation phase, so the deferral is bounded.
- **Postgres-backed durable state over new vendor** — rate-limit store, audit log, import history all live on the existing Neon connection. Three new tables, zero new dependencies.

### Key Lessons

1. **Verifier output should be persisted as a file by default**, not just the SUMMARY.md narrative. The audit gap on Phases 13 + 14 came from skipping the explicit `/gsd:verify-work` step even though the verification work was done. Treat the file as the artifact, not the verification.
2. **Status fields with non-terminal states ("human_needed") need an explicit close path**. 15-VERIFICATION.md sat at `human_needed` for ~24 hours after 15-HUMAN-UAT.md was already 3/3 because no command propagated the human-test outcome back to the verification frontmatter.
3. **Live UAT against a real deployment catches what unit tests cannot** — the rate-limit hammer (UAT #3) is the only proof that the Postgres store works cross-instance. Plan to bake at least one live-deployment UAT into every operations-adjacent phase.
4. **Worktree path discipline matters**. Writing files using main-repo absolute paths from inside a worktree corrupts the workspace and silently confuses tests. Re-derive `git rev-parse --show-toplevel` at the top of every executor session.
5. **Don't over-abstract logging transports** — single console JSON line, deep-redacted, was sufficient for v1.2; an external log drain would have been premature complexity.

### Cost Observations

- Model mix: predominantly opus (planning, code review, audit) with sonnet for execution and integration checks
- 39 commits / 6 plans = ~6.5 commits per plan including review/fix loops
- Phase 15 alone: 33 commits (heaviest fix-loop in the milestone, but also the highest-stakes phase)
- Notable: the integration-checker subagent (sonnet) returned a complete cross-phase verdict in ~4 minutes against 25+ source files — well-suited to milestone-audit context savings vs reading those files in the orchestrator

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 MVP | 5 | 15 | Initial GSD adoption; static-build storefront |
| v1.1 Admin Panel & Inventory Management | 8 (incl. 10.1 inserted) | 18 | Database migration; admin auth; multi-CSV import; one decimal-phase insertion (10.1) |
| v1.2 Store Operations & Hardening | 3 | 6 | Operations-first phases; STRIDE security review; first live-deployment UAT regimen |

### Cumulative Quality

| Milestone | Tests (post-shipping) | Files Changed | Notes |
|-----------|----------------------|---------------|-------|
| v1.0 | (initial) | — | Static build, build-time data |
| v1.1 | 224 | — | Database, auth, admin CRUD, CSV import |
| v1.2 | 272 | 38 (+5,423 / −130) | Rate-limit, structured logs, audit trail, health, smoke, security review |

### Top Lessons (Verified Across Milestones)

1. **Phases that ship a single user-facing flow end-to-end** outperform phases that ship multiple flows. v1.2 used this with discipline (each phase = one operator concern) and shipped in ~14 days vs v1.1's longer timeline.
2. **Atomic `db.batch([...])` for multi-table writes** has now proven itself across import commit (Phase 10 + 14) and order persistence (Phase 11). Should be the default whenever a write touches more than one table.
3. **Audit/security artifacts shipped alongside code** (Phase 14 audit + Phase 15 STRIDE review) are easier to maintain than retroactive documentation. Prefer in-phase to post-phase.
