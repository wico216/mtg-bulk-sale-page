# Phase 24 Context — Visual QA Release Loop

**Milestone:** v1.5 Visual QA Release Loop
**Created:** 2026-06-25
**Mode:** GSD / loop-engineering rollout
**Repo:** `wico216/mtg-bulk-sale-page`

## Project fields

**Project:** Spellbook Visual QA Release Loop
**Goal:** Make every AI-assisted Spellbook UI/product change produce proof, pass a browser-openable Wiko QA gate, and leave behind reusable tests/process notes.
**Non-goals:** Build a generic QA SaaS, auto-merge releases, expose QA publicly, or migrate away from GitHub/Vercel/Playwright.
**Safety constraints:** Password-protected QA, server-side approval enforcement, failed-gate notes required, no secret/customer data in proof artifacts, release guard fails closed.
**Success proof:** Unit tests, Playwright gate tests, a sample mobile storefront proof packet, `/qa/gates` review flow, and a release/status script or documented command that reports approved/failed/pending.

## Current architecture discovery

### Existing QA implementation

- `src/lib/qa-gates.ts`
  - Defines `QaGateRun`, checklist/evidence/artifact types, helper functions, and hard-coded `QA_GATE_RUNS`.
  - Existing runs include `latest-mtg-bulk-changes` and `demo-mobile-storefront-gate`.
- `src/app/qa/gates/page.tsx`
  - Lists available QA gates.
- `src/app/qa/gates/[runId]/page.tsx`
  - Renders a selected QA gate packet.
- `src/app/qa/_components/qa-gate-reviewer.tsx`
  - Client-side checklist, notes, approve/fail controls, video/evidence display.
- `src/app/api/qa/gates/[runId]/review/route.ts`
  - Loads/saves latest review.
  - Requires QA/admin access.
  - Rate-limits mutation.
  - Rejects crafted approvals unless all required checklist rows pass.
  - Rejects failed decisions without notes.
- `src/db/qa-gate-reviews.ts`
  - Stores review decisions in `admin_audit_log` with `action = 'qa_gate.review'`.
- `docs/qa-approval-gates.md`
  - Documents MVP and future hardening.
- `e2e/qa-gates.spec.ts`
  - Verifies remote reviewer flow and required-checklist UI behavior.
- `src/app/api/qa/gates/[runId]/review/__tests__/route.test.ts`
  - Verifies server-side review guards.

### Current gaps

1. Gate packets are still manually edited in source code.
2. No standard manifest/schema for agent-generated proof packets.
3. No release guard/check command that tells Atlas/CI whether a gate is approved, failed, or pending.
4. No standard Playwright proof artifact capture recipe for passing runs.
5. No concrete mobile storefront exemplar gate for the new loop-engineering workflow.
6. Docs explain the MVP but not the full repeated loop: issue → plan → implementation lane → proof → Wiko sign-off → release → regression learning.

## Requirements

| ID | Requirement | Verification |
|---|---|---|
| VQA-01 | A gate packet can be generated from a structured manifest instead of hand-writing every field from scratch. | Unit test validates manifest → `QaGateRun` shape. |
| VQA-02 | Proof artifacts support remote URLs and clearly label screenshot/video/trace/deployment links. | Gate fixture includes deployment + screenshot/video artifact rows. |
| VQA-03 | A sample mobile storefront QA gate exists as the reference loop exemplar. | Playwright route test opens it and verifies checklist/proof sections. |
| VQA-04 | Approvals remain server-enforced; UI-only disabling is not trusted. | Existing route tests stay green; add/keep crafted approval rejection. |
| VQA-05 | Failed gates require actionable notes for the next agent loop. | Existing route test stays green. |
| VQA-06 | Atlas/release tooling can query gate status and fail closed when not approved. | Script/test or documented command returns approved/failed/pending. |
| VQA-07 | The release loop is documented in work-friendly terms: Visual QA Gate / UI Review / UAT sign-off. | `docs/qa-approval-gates.md` or new docs page updated. |
| VQA-08 | The pattern is transferable to work/Nova without exposing Spellbook internals or secrets. | Work-transfer section maps Spellbook terms to general product/dev UAT. |

## Risk notes

- Artifact storage is the main unsolved external dependency. MVP should allow remote URLs and document Vercel Blob/R2/S3 as future storage, not block on storage integration.
- Do not add a DB migration unless the phase explicitly decides to store gate manifests in the database. Source-controlled registry plus audit-log reviews is enough for v1.5.
- Avoid making approvals too heavy. The value is fast proof + clear approve/fail, not a bureaucracy layer.

## Phase 24 plan set

1. **24-01 — Gate packet generator + registry cleanup**
   - Make QA gate metadata easier to generate/validate.
2. **24-02 — Mobile storefront proof exemplar**
   - Add a real reference gate and proof checklist for mobile storefront change review.
3. **24-03 — Release guard + reusable playbook**
   - Add status check/release loop docs and translate the pattern to work UAT.
