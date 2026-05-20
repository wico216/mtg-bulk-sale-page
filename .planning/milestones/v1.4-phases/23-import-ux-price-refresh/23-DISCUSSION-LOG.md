# Phase 23: Import UX & Price Refresh - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-20
**Phase:** 23-import-ux-price-refresh
**Areas discussed:** Tier 2 live-DB test, CRON_SECRET runbook, Manual refresh UX, Audit metadata extras

---

## Tier 2 live-DB test

| Option | Description | Selected |
|--------|-------------|----------|
| Tier 1 only | Default-run unit tests with `vi.stubEnv` + mocked Scryfall + mocked DB only. No TEST_DATABASE_URL test. | ✓ |
| Tier 2 opt-in, blocked on Phase 18 todo | Add a TEST_DATABASE_URL-gated test for advisory-lock contention; SUMMARY notes Phase 18 dependency. | |
| Tier 2 + Tier 1, both must pass | Mirror Phase 18 pattern exactly: Tier 1 default + Tier 2 gated; SUMMARY flags skip-in-CI risk. | |

**User's choice:** Tier 1 only
**Notes:** Avoids re-introducing the v1.3.5 silent-skip pattern. Phase 18's TEST_DATABASE_URL harness is still pending operator provisioning — adding another env-gated test would compound risk. Advisory-lock behavior gets verified via operator UAT against the deployed cron post-deploy.

---

## CRON_SECRET runbook

| Option | Description | Selected |
|--------|-------------|----------|
| Setup-only in SUMMARY | One-time `openssl rand -hex 32` → Vercel env → redeploy → verify via `/admin/health`. No rotation policy. | ✓ |
| Setup + rotation in SUMMARY | Same setup steps + short Rotation section (cadence, zero-downtime caveat, rotation steps). | |
| Separate ops runbook file | Dedicated `.planning/ops/CRON_SECRET.md` or similar — indexable standalone doc. | |

**User's choice:** Setup-only in SUMMARY
**Notes:** Rotation policy is deferred. Operator can revisit if a leak is suspected.

---

## Manual refresh UX

| Option | Description | Selected |
|--------|-------------|----------|
| Button-local state, no toast | `Refreshing…` while in flight; `router.refresh()` on 200; inline error under button on 409/5xx (~5s); no new toast dep. | ✓ |
| Toast + button state | Same button-local state + toast/alert at page top for success and error. Adds new pattern if not already shipped. | |
| Server-rendered status banner | Flash-cookie + server-rendered banner under header on error; `router.refresh()` on success. | |

**User's choice:** Button-local state, no toast
**Notes:** 409 message: `Refresh in progress — try again in a moment`. 5xx message: `Refresh failed — check logs`. Keeps the failure-mode distinction visible to operator without introducing a global notification system.

---

## Audit metadata extras

| Option | Description | Selected |
|--------|-------------|----------|
| Locked scalars only | `{ trigger, updated, unchanged, failed, skipped, durationMs }` only. Per-card detail via Phase 15 logger. | ✓ |
| Locked scalars + bounded failedSample | Add `failedSample: string[]` capped at 20 scryfallIds (~720 bytes worst case). | |
| Locked scalars + bounded errors[] | Add `errors: { scryfallId, reason }[]` capped at 20. Slightly more code; renderer needed. | |

**User's choice:** Locked scalars only
**Notes:** Preserves Phase 14 "safe and bounded" invariant with maximum 4KB-cap headroom. Per-card failure detail flows through structured logs, not audit table.

---

## Claude's Discretion

- Exact inline error copy under the manual refresh button (sketches in D-03 — planner may tighten to match other admin error patterns).
- Exact placement of the "X of Y selected" counter on the binder picker.
- Chunked UPDATE batch size (research recommended 500 rows/chunk; planner may adjust if profiling justifies).

## Deferred Ideas

None new from this discussion. All v2 deferrals already captured in `.planning/REQUIREMENTS.md` v2 sections (IMPORT-UX-FUT-01..03, PRICE-REFRESH-FUT-01..05).

### Reviewed Todos (not folded)

- `01-phase-18-concurrent-proof.md` — reviewed for relevance; keyword match (`TEST_DATABASE_URL`, `concurrent`) is incidental. Plan 23-01 deliberately stays Tier 1 only per the Tier 2 decision above. The Phase 18 harness remains operator's separate pending next step.
