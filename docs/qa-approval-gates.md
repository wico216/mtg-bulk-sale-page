# QA Approval Gates

Remote, password-protected **Visual QA / UI Review / UAT sign-off** packets for Wiko's Spellbook feature work.

The goal is not just a page with an Approve button. The goal is a repeatable release-quality loop:

```text
Idea / bug
→ GSD plan
→ AI lane implements
→ Playwright verifies
→ Visual QA gate
→ Wiko approves or fails
→ release
→ lesson becomes regression test / checklist / runbook
```

## What ships now

- `/qa/gates` lists available approval gates.
- `/qa/gates/[runId]` shows:
  - Playwright proof video URL when attached
  - expected behavior
  - evidence rows with observed result/status
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

## Gate authoring model

Gate packets are registered in `src/lib/qa-gates.ts` with `defineQaGateRun(...)`.

The helper turns a compact manifest into a complete `QaGateRun` and validates required fields at module load/test time:

- identity: `id`, `ticketId`, `title`, `featureArea`, `summary`
- proof: `proofRun.tool`, `recordedAt`, `targetUrl`, `browser`, `command`, `resultSummary`
- review: at least one expected behavior and checklist row
- evidence: valid status/kind and optional checklist mapping
- artifacts: non-empty label/URL and valid kind

Example shape:

```ts
defineQaGateRun({
  id: "mobile-storefront-visual-qa-loop",
  ticketId: "VQA-24-02",
  title: "Mobile Storefront Visual QA Loop",
  featureArea: "Visual QA / mobile storefront UAT",
  summary: "What Wiko is approving or failing.",
  proofRun: {
    tool: "Playwright",
    recordedAt: new Date().toISOString(),
    targetUrl: "https://<preview>.vercel.app",
    browser: "Chromium mobile viewport",
    command: "PLAYWRIGHT_PORT=3202 CI=1 npx playwright test ...",
    resultSummary: "Passed mobile layout proof.",
  },
  createdAt: new Date().toISOString(),
  expectedBehavior: ["What should be true for the user."],
  checklist: [
    {
      id: "mobile-proof-attached",
      label: "Mobile proof is attached",
      expected: "Screenshot/video proof opens from the QA gate.",
      required: true,
    },
  ],
});
```

## Reference mobile storefront Visual QA gate

`mobile-storefront-visual-qa-loop` is the v1.5 reference packet for applying loop engineering to Spellbook.

It is intentionally honest: it is a reusable reference gate, not a fake approval for a specific unreleased branch. Real release gates must replace placeholder/warning evidence with actual mobile proof artifacts captured from the branch or preview under review.

Use it as the template for future mobile work:

1. Attach a preview/deployment URL.
2. Attach mobile screenshot/video proof from Playwright or equivalent browser automation.
3. Write expected behavior in product language, not implementation jargon.
4. Require checklist rows for mobile layout safety, usable controls, remote-reviewable artifacts, and actionable failure notes.
5. If Wiko fails the gate, convert the notes into the next agent loop and add a regression test/checklist/runbook item.

## Video/artifact model

The MVP stores artifact URLs in source-controlled gate metadata. Vercel's serverless filesystem is not durable, so Playwright videos should live somewhere remote:

1. Preferred future storage: Vercel Blob, R2, S3, or another artifact store.
2. Store the artifact URLs on the gate run.
3. If artifact URLs are public/unlisted, the page is password-protected but the direct artifact URL may not be. Use private/signed URLs or a gated proxy route for sensitive proof.

## Release-status guard

Use the status guard before merge/release when a gate must be approved:

```bash
QA_GATE_PASSWORD='<password>' \
  npx tsx scripts/check-qa-gate-status.ts \
  --deployment https://<preview-or-production-url> \
  --run mobile-storefront-visual-qa-loop \
  --require-approved
```

Status values:

| Status | Meaning | Release behavior with `--require-approved` |
|---|---|---|
| `approved` | Latest review approved the gate | exit 0 |
| `failed` | Latest review failed/requested fixes | non-zero |
| `pending` | No review recorded yet | non-zero |
| `unreadable` | Auth/network/API/read error | non-zero, fail closed |

For JSON output:

```bash
npx tsx scripts/check-qa-gate-status.ts \
  --deployment https://<preview-or-production-url> \
  --run <run-id> \
  --json
```

## Recommended Spellbook workflow

1. Atlas creates/updates the GSD plan.
2. Implementation lane builds the feature/fix on a branch.
3. Playwright records proof against the branch preview or candidate deployment.
4. Atlas registers a QA gate packet with expected behavior, evidence, artifacts, and checklist.
5. Wiko opens `/qa/gates/[runId]` from the Vercel URL.
6. Wiko watches proof, marks checklist rows, leaves notes, and approves/fails.
7. Atlas treats **failed** or **pending** gates as release blockers.
8. After fixes, the loop repeats until approval.
9. The release report includes test output, QA status, preview/production URLs, and any regression-learning updates.

## Transfer-to-work mapping

| Spellbook | Work/Nova equivalent |
|---|---|
| Bug/feature | Client issue / roadmap item |
| GSD plan | Product brief / implementation plan |
| AI lane | Engineer / dev agent / implementation team |
| Playwright proof | QA automation / acceptance evidence |
| `/qa/gates` | UAT sign-off / release approval page |
| `admin_audit_log` | Ticket history / audit trail |
| Vercel preview | Staging environment |
| Regression test | Prevented-repeat production issue |

Keep sensitive work data out of Spellbook artifacts and avoid piping private Nova/customer content into unapproved cloud tools.

## Future hardening

- Upload artifacts to private Vercel Blob/R2 and serve via signed URLs.
- Add a GitHub Check that blocks merge until the gate status is approved.
- Add a `/qa/gates/[runId]/history` view for all prior decisions.
- Add a creation API protected by `QA_INGEST_SECRET` for CI/agent runs.
- Add artifact retention/cleanup rules.
