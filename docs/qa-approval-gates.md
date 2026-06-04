# QA Approval Gates

Remote, password-protected review packets for Wiko's Spellbook feature work.

## What ships in this MVP

- `/qa/gates` lists available approval gates.
- `/qa/gates/[runId]` shows:
  - Playwright proof video URL
  - expected behavior
  - artifacts/deployment links
  - review checklist
  - reviewer name
  - notes for Atlas Dev
  - **Approve** / **Fail** actions
- `/qa/login` protects the QA surface with a shared password cookie.
- Existing admin sessions can also access the QA surface.
- Reviews are stored as `admin_audit_log` rows with:
  - `action = 'qa_gate.review'`
  - `target_type = 'qa_gate'`
  - `target_id = runId`
  - metadata containing decision, notes, reviewer name, and checklist state.

This intentionally avoids a schema migration for the first version.

## Vercel configuration

Set these environment variables before using the gate remotely:

- `QA_GATE_PASSWORD` — shared review password for Wiko / trusted reviewers.
- `QA_GATE_COOKIE_SECRET` — optional but recommended; falls back to `AUTH_SECRET` if omitted.
- `DATABASE_URL` — already required by the app; review decisions persist through the existing Neon database.

Do **not** commit the password. Set it in Vercel Project Settings → Environment Variables for Preview and/or Production.

## Video artifact model

The MVP stores only video URLs in source-controlled gate metadata. Vercel's serverless filesystem is not durable, so Playwright videos must live somewhere remote:

1. Preferred next step: upload videos/screenshots/traces to Vercel Blob, R2, S3, or another artifact store.
2. Store the artifact URLs on the gate run.
3. If artifact URLs are public/unlisted, the page is password-protected but the direct video URL is not. Use private/signed URLs or a gated proxy route for sensitive proof.

## Adding a gate run today

Add a new entry to `QA_GATE_RUNS` in `src/lib/qa-gates.ts` with:

- `id`
- `title`
- `featureArea`
- `summary`
- `branch` / `commitSha` / `prUrl` / `deploymentUrl` as available
- `videoUrl`
- `expectedBehavior`
- `checklist`
- `artifacts`

Future automation should generate this metadata after Playwright records the proof video.

## Recommended workflow

1. Atlas Dev implements the feature on a branch.
2. Playwright records the proof video against the Vercel preview URL.
3. Atlas Dev adds/ingests a QA gate run with expected behavior and checklist.
4. Wiko opens `/qa/gates/[runId]` from the Vercel URL.
5. Wiko watches the video, marks checklist rows, leaves notes, and approves/fails.
6. Atlas Dev treats **failed** gates as required changes before merge/release.

## Future hardening

- Generate gate runs automatically from Playwright output.
- Upload artifacts to private Vercel Blob/R2 and serve via signed URLs.
- Add a GitHub Check that blocks merge until the gate status is approved.
- Add a `/qa/gates/[runId]/history` view for all prior decisions.
- Add a creation API protected by `QA_INGEST_SECRET` for CI/agent runs.
