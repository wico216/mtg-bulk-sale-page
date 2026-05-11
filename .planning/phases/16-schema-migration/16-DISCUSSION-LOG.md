# Phase 16: Schema & Migration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-11
**Phase:** 16-Schema & Migration
**Areas discussed:** First-deploy operator transition, Migration runtime, Verification UX, Backup retention strategy

---

## First-deploy operator transition

| Option | Description | Selected |
|--------|-------------|----------|
| Show 'unsorted' in picker, default UNCHECKED | Picker shows 'unsorted (12,749 rows)' as a checkbox; default UNCHECKED so legacy data persists untouched on first import. Safest default; matches the no-binder-touched-without-explicit-selection rule. | ✓ |
| Show 'unsorted' but default CHECKED | Picker default-checks 'unsorted' so the legacy data is replaced on first import. Risky if operator forgets to uncheck. | |
| Hide 'unsorted' from picker entirely | Operator must use a separate admin action ('Clear unsorted' button on /admin/inventory) to manage legacy rows. | |

**User's choice:** Show 'unsorted' in picker, default UNCHECKED
**Notes:** Decision technically belongs to Phase 19 (the picker UI), but captured here so Phase 19 builds it correctly. Phase 16's migration just needs to populate `binder='unsorted'` so the rows EXIST under that name when Phase 19's picker queries `SELECT DISTINCT binder` later.

---

## Migration runtime

| Option | Description | Selected |
|--------|-------------|----------|
| Manual `npm run migrate:v1.3` from local machine pointed at prod DATABASE_URL | Operator runs locally when ready. Pre-flight assertions print first. Operator confirms before any DML. Vercel deploy of v1.3 code happens AFTER successful migration. Matches Phase 14's manual schema-update pattern. | ✓ |
| Auto-run during Vercel build (`vercel-build` or `postbuild` hook) | Migration runs every Vercel deploy. Idempotency pre-flights ensure single run. Risk of preview deploys tripping pre-flights or running against wrong DB. | |
| Paste generated SQL into Neon console manually | Skip the TS script. drizzle-kit generates SQL; operator pastes into Neon SQL editor. No automated pre-flights or summary. | |

**User's choice:** Manual local run with pre-flight assertions, before Vercel code deploy
**Notes:** Reaffirms the project pattern from Phase 13/14 where schema changes are applied after explicit user approval, never during build. Adds dry-run flag for Neon-branch rehearsal.

---

## Verification UX after migration

| Option | Description | Selected |
|--------|-------------|----------|
| Migration script prints structured terminal summary | Script ends with rows-migrated, id-format check, finish backfill counts, constraint presence, sample IDs. Eyeball the output, deploy v1.3 code. Lightest weight. | ✓ |
| Add 'Schema version' tile to /admin/health page | Adds new check to /admin/health that queries pg_constraint + information_schema and reports 'v1.3 schema'. Adds one small admin UI piece in this phase. | |
| Smoke script verifies schema state | Extends scripts/smoke-production.ts with a 6th check exposing schema version via a tiny /api/admin/health field. | |

**User's choice:** Migration script prints structured terminal summary
**Notes:** Smoke script and /admin/health changes (if ever wanted) deferred — neither belongs in Phase 16's scope. Terminal summary is the contract.

---

## Backup retention strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Neon branch dry-run + Neon PITR | (1) Neon branch from prod, (2) run migration on branch, (3) verify, (4) discard branch, (5) run on prod. Neon's automatic PITR (~24-72h) covers post-deploy rollback. Zero manual file management. | ✓ |
| Neon branch dry-run + local pg_dump to .planning/migrations/v1.3/backups/ | Same as above plus a one-time pg_dump to a gitignored local folder. Belt-and-suspenders. | |
| Neon branch dry-run + pg_dump pushed to external storage (S3, etc.) | Same as above but durable off-machine. More setup. | |

**User's choice:** Neon branch dry-run + Neon PITR — no separate dump
**Notes:** Migration script header comment must document the Neon PITR rollback procedure so the operator has the recipe in front of them if something goes wrong post-deploy.

---

## Claude's Discretion

- Internal organization of the migration script (helpers, naming, comments)
- Pre-flight assertion implementation details (specific SQL queries, error messages)
- Test scaffolding for the migration script
- Decision NOT to write a `down` migration — rollback is Neon PITR; a down migration would be misleading because the data rewrite is destructive

## Deferred Ideas

- Schema-version indicator on /admin/health → revisit in v1.4+
- Smoke script schema check → belongs to Phase 22 (Hardening & UAT)
- External backup storage (S3) for pg_dump → revisit if friend store grows or a future migration is more destructive
