---
status: partial
phase: 15-production-hardening
source: [15-VERIFICATION.md]
started: 2026-05-10T20:45:00Z
updated: 2026-05-10T20:45:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Sign in to `/admin/health` locally and confirm every check is green and no env values appear in HTML source

expected: Database = OK, Auth secret / Google OAuth / Email = Configured. View source contains `configured` / `missing` literals only, never `AUTH_SECRET` / `RESEND_API_KEY` / `GOOGLE_SECRET` values.

how to run:

```bash
npm run dev
# Open http://localhost:3000/admin/login → sign in with the admin Google account
# Navigate to http://localhost:3000/admin/health
# View page source (Ctrl-U): grep for AUTH_SECRET, RESEND_API_KEY, GOOGLE_SECRET — should find nothing
```

result: [pending]

### 2. Run `npm run smoke:production -- --deployment <vercel-url>` against the live deployment

expected: 5/5 checks pass. The DELETE `/api/admin/cards` (unauth) probe MUST return 401 — exit code 0.

how to run:

```bash
# After Phase 15 is merged + deployed to Vercel:
npm run smoke:production -- --deployment https://<your-deployment>.vercel.app
echo "exit: $?"
```

result: [pending]

### 3. Manual rate-limit hammer against deployed `/api/checkout`

expected: Burst of 11+ checkout POSTs from one IP within 60s returns 429 with `Retry-After` header on the 11th; the burst inserts no orders past the limit.

how to run:

```bash
# After Phase 15 is deployed:
for i in $(seq 1 15); do
  curl -sS -o /dev/null -w "%{http_code} " -X POST https://<your-deployment>.vercel.app/api/checkout \
    -H "Content-Type: application/json" \
    -d '{"items":[{"id":"nonexistent","qty":1}],"buyer":{"name":"t","email":"t@t.com","message":""}}'
done
echo
# Expect: 400 400 400 400 400 400 400 400 400 400 429 429 429 429 429
# Then check the orders table — no rows inserted from this burst.
```

result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
