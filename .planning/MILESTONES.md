# Milestones

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
- 5 acknowledged security-review deferrals (S-01, D-DOS-01/02/03, I-DISC-03)
- Nyquist VALIDATION.md missing for all 3 phases (project-wide baseline)

---
