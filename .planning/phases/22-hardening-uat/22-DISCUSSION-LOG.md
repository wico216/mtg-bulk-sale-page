# Phase 22: Hardening & UAT - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-05-11
**Mode:** Auto

---

## UAT scenario count

| Option | Selected |
|--------|----------|
| 5 scenarios covering picker autopilot, cart hydration, CHECK trip, binder leak grep, multi-binder concurrent checkout | ✓ |
| Match Phase 15's 3-scenario count | |
| Expanded 8+ scenarios | |

**Rationale:** v1.3 has more user-facing surface than v1.2's hardening phase; 5 covers the load-bearing risks without bloat.

## STRIDE delta location

| Option | Selected |
|--------|----------|
| New file 22-SECURITY-REVIEW.md mirroring Phase 15 format | ✓ |
| Append to 15-SECURITY-REVIEW.md | |

**Rationale:** Phase boundary clarity; 22-SECURITY-REVIEW.md references 15 as baseline.

## Perf pin mechanism

| Option | Selected |
|--------|----------|
| Vitest test with `expect(elapsed).toBeLessThan(2000)` | ✓ |
| Separate benchmark suite | |
| CI-only check | |

**Rationale:** In-suite test runs every npm test; cheap; surfaces regressions immediately.

## Picker latency target

| Option | Selected |
|--------|----------|
| Playwright if in project; otherwise manual UAT step | ✓ |
| Always manual | |
| Hard requirement Playwright | |

**Rationale:** Adapt to project state; planner checks `package.json`.
