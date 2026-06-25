# Phase 24 Discussion Log — Visual QA Release Loop

## 2026-06-25 — Kickoff from Wiko / Atlas

Wiko asked about loop engineering and how it applies to his work. Atlas recommended using Spellbook as the sandbox, specifically a repeatable release-quality loop:

```text
Idea / bug
→ GSD plan
→ AI lane implements
→ Playwright verifies
→ UI Review gate
→ Wiko approves/fails
→ release
→ lesson becomes regression test
```

Wiko then asked to run it through GSD. Atlas interpreted the follow-up “gas / Gsd” as “run it on GSD” and created this v1.5/Phase 24 planning track.

## Locked decisions

- Use work-friendly terms externally: **Visual QA Gate**, **UI Review**, or **UAT sign-off**.
- Keep the internal implementation in Spellbook under `/qa/gates`.
- Preserve `admin_audit_log` review persistence for now; no schema migration required in the first loop-hardening slice.
- Server-side approval enforcement remains mandatory.
- The first implementation should be narrow and reversible: generator/manifest + exemplar + status guard/docs.

## Open decisions for execution

1. **Manifest format:** JSON file, TypeScript factory object, or CLI-generated TS entry?
   - Default planning assumption: typed manifest/factory with validation tests; avoid runtime filesystem reads in Next client components.
2. **Artifact storage:** remote URL only for v1.5, or integrate Vercel Blob/R2 now?
   - Default planning assumption: remote URL only; storage integration deferred.
3. **Release guard location:** local script, GitHub Action, or both?
   - Default planning assumption: local/CI-safe script first; GitHub required check later if useful.
4. **Approval target:** PR preview gate or production candidate gate?
   - Default planning assumption: preview gate before merge; production smoke after merge.
