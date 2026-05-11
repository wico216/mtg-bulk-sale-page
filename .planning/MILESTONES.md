# Milestones

## v1.3 Binder-Aware Inventory & Pick Workflow (Shipped: 2026-05-11)

**Phases completed:** 7 phases (16-22), 11 plans, 73 commits
**Code change:** 136 files changed, +36,666 / −1,344 (TypeScript codebase: 26,292 LOC; +6,631 from v1.2)
**Timeline:** 2026-05-10 → 2026-05-11 (~5 hours autonomous run from milestone bootstrap to merge-ready)
**Audit:** `.planning/milestones/v1.3-MILESTONE-AUDIT.md` — `tech_debt` (29/29 requirements satisfied; 8/8 wiring; 5/5 flows; missing Phase 22 VERIFICATION.md aggregator + 3 operator handoff items)
**Test count:** 300 (start) → 464 passed + 2 skipped (end). Net +164 tests, +9 test files.
**Known deferred items at close:** 3 operator handoffs + 4 historical (see STATE.md `## Deferred Items`)

**Key accomplishments:**

- **Phase 16 — Schema & Migration:** Custom Drizzle SQL migration (`scripts/migrate-v1.3-binder.ts`) with 3 idempotency pre-flights, single `db.batch` atomic apply, structured terminal summary. Adds `binder` column on cards + order_items, `pgEnum('finish', ['normal','foil','etched'])`, `CHECK (quantity >= 0)` constraint as the schema-level safety net for Phase 18's allocator. 5-segment composite id `${setCode}-${collectorNumber}-${finish}-${condition}-${binder}`.
- **Phase 17 — Parser & Etched:** Manabox CSV parser ingests `Binder Name`/`Binder Type`; skips `Binder Type != 'binder'` and `Quantity = 0`; normalizes binder names (`trim().toLowerCase().replace(/\s+/g, ' ').replace(/-/g, '_')` via shared `binder-name.ts`). **Fixes a latent v1.2 bug** at csv-parser.ts:87 where 11 etched cards in the operator's collection (Wrath of God, Cultist of the Absolute, Master Chef, Tor Wauki the Younger, Jasmine Boreal of the Seven, +6) were silently treated as `normal` with wrong prices. Full `card.foil` → `card.finish` sweep.
- **Phase 18 — Allocator:** Server-side multi-binder allocator inside `placeCheckoutOrder` as a single 11-CTE SQL chain (neon-http has no interactive transactions; pure SQL is the only atomic path). Pick order: smallest-quantity-first + lexicographic tiebreaker (matches operator's "consolidate small binders" mental model). `FOR UPDATE OF cards` on the aggregated key (NOT pre-chosen rows — load-bearing PITFALLS Pitfall 1 prevention). One `order_items` row per binder source with `binder` snapshotted. Multi-binder concurrent-proof harness (Variants 1+2; env-gated on TEST_DATABASE_URL).
- **Phase 19 — Import Preview & Picker:** Two-stage NDJSON contract: parse → emit `binders` message → operator selects → enrichment runs only on selected subset. Hand-rolled `binder-picker.tsx` mirroring `filter-rail.tsx` checkbox+count pattern. NEW binders sort to top with green pill; `unsorted` shows with Legacy badge default-unchecked; will-delete panel default-checked (operator must explicitly uncheck). Inline destructive confirmation with typed `REPLACE` phrase (mirrors Phase 10 D-13). New `replaceCardsForBinders` (replaces `replaceAllCards`); scoped `DELETE WHERE binder IN selected`. `ScopedImportAuditMetadata` bounded shape under 4KB cap.
- **Phase 20 — Storefront Aggregation & Cart Migration:** New `getCardsAggregated()` GROUP BY `(setCode, collectorNumber, finish, condition)` returning AdminCard[] with SUM(quantity), AVG(price), distinct binders[]. **PublicCard/AdminCard/PublicOrderItem/PublicOrderData type split** is the load-bearing privacy guarantee — TypeScript catches binder leak at compile time. Per-route invariant tests on GET /, GET /cart, POST /api/checkout assert `JSON.stringify(response).includes('binder') === false`. Caught and fixed a real Phase 18 binder leak in CheckoutResponse.order.items via `PublicOrderItem` strip. Cart reconciliation extends Phase 10-03 silent-removal pattern (5-step pipeline) + one-time informational toast on first v1.3 visit gated by `viki-cart` version sentinel.
- **Phase 21 — Admin Visibility & Audit:** Admin inventory table gains Binder column + filter dropdown (URL search params); Admin dashboard adds "Breakdown by binder" tile. Admin order detail shows `[binder]` pill from `order_items.binder` snapshot (NEVER joined to live cards — survives subsequent re-imports). Multi-binder same-card lines render as multiple rows. Audit page renders ScopedImportAuditMetadata in a collapsed expander with per-binder before→after counts.
- **Phase 22 — Hardening & UAT:** Resolves Phase 15 D-DOS-01 by adding ADMIN_BULK rate limit to `/api/admin/import/preview` AFTER `requireAdmin()`. STRIDE delta document records new I-DISC-05 binder-leak finding (resolved by Phase 20 type split). Perf pin: 12,749-row Manabox CSV parses in 38ms (50x under 2s bound). 5 live-deployment UAT scenarios documented in `22-HUMAN-UAT.md` for operator execution post-deploy.

**Tech debt carried forward:**

- Phase 16: VERIFICATION.md status `human_needed` — operator must run migration dry-run + production cutover (`npm run migrate:v1.3:dry-run` then `npm run migrate:v1.3`)
- Phase 18: Multi-binder concurrent-proof 5x flake check — operator must provision `TEST_DATABASE_URL` against a Neon test branch
- Phase 22: Missing canonical VERIFICATION.md aggregator (work captured in 22-SECURITY-REVIEW.md + 22-HUMAN-UAT.md + per-plan SUMMARYs); 5 UAT scenarios pending operator execution against live deployment
- Nyquist VALIDATION.md missing for all 7 phases (project-wide baseline; matches v1.0/v1.1/v1.2)

---

## v1.2 Store Operations & Hardening (Shipped: 2026-05-11)

**Phases completed:** 3 phases (13, 14, 15), 6 plans, 39 commits
**Code change:** 38 files changed, +5,423 / −130 (TypeScript codebase: 19,661 LOC)
**Timeline:** 2026-04-27 → 2026-05-11 (~14 days)
**Audit:** `.planning/milestones/v1.2-MILESTONE-AUDIT.md` — `tech_debt` (12/12 requirements satisfied; 6/6 wiring; 5/5 flows; one logging-consistency warning + missing VERIFICATION.md files for Phases 13/14)
**Known deferred items at close:** 5 (see STATE.md `## Deferred Items`)

**Key accomplishments:**

- **Phase 13 — Admin order workflow:** Status transitions (pending/confirmed/completed/cancelled), search/filter by ref/name/email/status, private internal notes, and order cancellation with explicit optional inventory restore. Cancelled orders preserve full history; restore CTE is gated by the first successful cancellation update.
- **Phase 14 — Inventory audit trail:** `admin_audit_log` table covers 8 high-impact mutation surfaces (inline edit, single/bulk/all delete, import commit, order status update, cancel, restore). First-class `import_history` for CSV commits. Admin-visible `/admin/audit` page renders both with independent pagination. Audit metadata is bounded and secret-redacted before insert.
- **Phase 15-01 — Production guardrails:** Sliding-window rate-limit (`src/lib/rate-limit.ts`) with Postgres-backed store and atomic CTE; CHECKOUT 10/min, ADMIN_MUTATION 60/min, ADMIN_BULK 20/min. Blocked attempts do NOT extend their own window. Wired BEFORE body-parse on `/api/checkout`, AFTER `requireAdmin()` on all 7 admin mutation routes (so unauth always 401, never 429).
- **Phase 15-01 — Structured logging:** `src/lib/logger.ts` with deep redaction of secret-shaped keys (password/secret/token/api_key/cookie/raw_csv etc.), throwing-getter and BigInt guards, and Postgres unique-constraint PII scrub. Every Phase 15 route emits `logEvent`/`logError` on each state transition.
- **Phase 15-02 — Operational surfaces:** Admin-only `/admin/health` page + `/api/admin/health` JSON endpoint that returns `"configured"`/`"missing"` literals only (never env values), with DB SELECT 1 short-circuit and parallel MAX reads against orders/import_history/admin_audit_log. Repeatable `npm run smoke:production` script (5 read-only/guard checks). Operator runbook in `README.md` with env matrix and failure-symptom table.
- **Phase 15-02 — Security review:** STRIDE-style review of 13 surfaces (`15-SECURITY-REVIEW.md`); 0 High-severity findings; 4 deferred Medium follow-ups (S-01 case-sensitive admin email, D-DOS-01..03 import preview/rate-limit-table/header-trust, I-DISC-03 notification-failure queryability) each with remediation steps and named owner phase.
- **Live deployment verified:** Production smoke against `wikos-spellbinder.vercel.app` 5/5 passed; rate-limit hammer confirmed Postgres store shared cross-instance with 429 + Retry-After (`15-HUMAN-UAT.md` 3/3).

**Tech debt carried forward:**

- Missing `13-VERIFICATION.md` and `14-VERIFICATION.md` (phases verified via SUMMARY browser+DB proof + green test suites only)
- `src/app/admin/audit/page.tsx:112` raw `console.error` bypasses structured logger
- 5 acknowledged security-review deferrals (S-01, D-DOS-01/02/03, I-DISC-03) — D-DOS-01 RESOLVED in v1.3 Phase 22
- Nyquist VALIDATION.md missing for all 3 phases (project-wide baseline)

---
