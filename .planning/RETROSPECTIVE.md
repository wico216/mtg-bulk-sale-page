# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

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
