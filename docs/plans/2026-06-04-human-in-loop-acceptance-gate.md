# Human-in-the-loop acceptance gate

## Goal

Build a browser-openable QA gate where Atlas/agents attach recorded browser evidence for a ticket/change, and Wiko can approve or reject before production publication without manually clicking through every screen.

## Current architecture discovered

- App: Next.js app router in `/tmp/mtg-bulk-sale-page`.
- Existing QA surface already exists on branch `feat/qa-approval-gates`:
  - `/qa/gates`
  - `/qa/gates/[runId]`
  - `/qa/login`
  - `/api/qa/login`
  - `/api/qa/logout`
  - `/api/qa/gates/[runId]/review`
- Access:
  - admin session or shared `QA_GATE_PASSWORD` signed cookie via `QA_GATE_COOKIE_SECRET` / `AUTH_SECRET`.
- Persistence:
  - review decisions stored in `admin_audit_log` as `action = 'qa_gate.review'`.
- MVP gate metadata is static in `src/lib/qa-gates.ts`.

## User-facing requirements

- The page must explain:
  - what changed,
  - what ticket/feature is being reviewed,
  - what expected behavior Wiko should verify,
  - what recorded proof the agent captured in browser,
  - what checklist items need pass/fail/NA.
- The page must embed/play recorded evidence, especially a video.
- Wiko must be able to approve/pass or reject/fail.
- Failed decisions should carry comments for Atlas to fix.

## Implementation slice

1. Extend gate metadata to describe a full acceptance packet:
   - ticket id/URL,
   - change summary,
   - reviewer instructions,
   - proof-run metadata,
   - per-expected-behavior evidence entries.
2. Improve `/qa/gates/[runId]` UI:
   - add “What changed”, “What to look for”, and “Agent-recorded evidence” sections,
   - keep video first-class,
   - make approval gated by required checklist pass states,
   - make failure comments explicit.
3. Harden review API:
   - reject failed decisions without actionable notes.
4. Add tests:
   - metadata shape tests,
   - component tests for the review page behavior,
   - API route tests for failure-comment enforcement,
   - Playwright smoke for password login and review page controls.

## Non-goals for this slice

- No GitHub Checks merge blocker yet.
- No durable artifact upload service yet; gate entries can point to durable URLs or public repo assets for now.
- No database-backed gate run creation yet.

## Verification

- Focused Vitest tests for QA gate metadata/component/API.
- `npm test`.
- `npx tsc --noEmit`.
- `npm run build`.
- Focused Playwright QA gate smoke.
- Full available E2E if time permits.
