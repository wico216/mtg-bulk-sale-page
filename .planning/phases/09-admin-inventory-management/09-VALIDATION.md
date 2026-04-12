---
phase: 9
slug: admin-inventory-management
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` or "none — Wave 0 installs" |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | INV-01 | — | N/A | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 09-02-01 | 02 | 2 | INV-02 | T-09-01 | Admin-only mutations | integration | `npx vitest run` | ❌ W0 | ⬜ pending |
| 09-02-02 | 02 | 2 | INV-03 | T-09-02 | Delete requires auth + confirmation | integration | `npx vitest run` | ❌ W0 | ⬜ pending |
| 09-03-01 | 03 | 2 | INV-05 | — | N/A | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 09-03-02 | 03 | 2 | INV-06 | — | N/A | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 09-03-03 | 03 | 2 | CSV-03 | T-09-03 | Export requires admin auth | integration | `npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest` — install if not present
- [ ] `src/__tests__/admin/` — test directory structure
- [ ] Test stubs for admin API routes (CRUD + export)

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Inline cell editing UX | INV-02 | Click-to-edit interaction requires browser | Click price cell, type new value, press Enter, verify update |
| Low stock visual highlight | INV-05 | Visual styling verification | Check qty=1 rows have distinct visual treatment |
| CSV file downloads | CSV-03 | Browser download behavior | Click Export CSV, verify file downloads with correct content |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
