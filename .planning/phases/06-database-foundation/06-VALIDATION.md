---
phase: 6
slug: database-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-11
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (or "none — Wave 0 installs") |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | DB-01 | — | N/A | unit | `npx vitest run src/db/__tests__/schema.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | DB-01 | — | N/A | unit | `npx vitest run src/db/__tests__/client.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 2 | DB-02 | — | N/A | integration | `npx vitest run src/db/__tests__/seed.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/db/__tests__/schema.test.ts` — stubs for DB-01 schema validation
- [ ] `src/db/__tests__/client.test.ts` — stubs for DB-01 connection verification
- [ ] `src/db/__tests__/seed.test.ts` — stubs for DB-02 seed idempotency
- [ ] vitest installed and configured (if not already present)

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Neon console provisioning | DB-01 | Requires Neon dashboard access | Verify database exists in Neon console with correct project name |
| drizzle-kit push succeeds | DB-01 | Requires live DB connection | Run `npx drizzle-kit push` and verify no errors |
| Seed data count matches | DB-02 | Requires live DB connection | Run seed, query `SELECT count(*) FROM cards`, compare with cards.json length |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
