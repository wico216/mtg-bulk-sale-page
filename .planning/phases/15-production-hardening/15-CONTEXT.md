# Phase 15: Production Hardening - Context

**Gathered:** 2026-04-27
**Status:** Planned

<domain>
## Phase Boundary

Phase 15 makes the store safer to run and easier to diagnose after the admin workflow and audit surfaces exist. The app already has core buyer/admin functionality; this phase focuses on guardrails, failure visibility, and repeatable production verification.

Phase 15 owns:
- rate limiting on public checkout and admin mutation surfaces
- structured server logs for high-impact workflows
- admin health/status page and/or endpoint
- production smoke script checked into the repo
- operational documentation for env vars, deployment smoke, backup/export, and failure diagnosis
- security review of admin/API surfaces

Phase 15 does not own:
- external observability vendor setup unless a narrow need appears
- payment/security work for Stripe or shipping
- buyer accounts
- full backup automation or rollback UI
- new product features beyond hardening the existing surfaces

</domain>

<decisions>
## Implementation Decisions

### Rate limiting
- **D-01:** Rate limits should protect mutation surfaces without breaking normal friend-store usage. Start with conservative per-IP and/or per-identity limits.
- **D-02:** Public checkout deserves special protection because it writes orders and decrements stock.
- **D-03:** Admin mutation APIs still need rate limits even though they are auth-gated; auth bugs and automation loops should not be able to hammer destructive endpoints.
- **D-04:** Use a storage mechanism compatible with Vercel/serverless. Do not rely on in-memory counters for production correctness.

### Observability
- **D-05:** Structured logs should include action, route/helper, actor when available, target counts/IDs where safe, status, and request/correlation ID when practical.
- **D-06:** Logs must never include secrets, auth tokens, raw CSV bodies, or full env values.
- **D-07:** Notification failure after checkout must remain non-blocking but visible to admins/health checks.

### Health and smoke
- **D-08:** Admin health should answer operational questions: DB reachable, auth configured, Google OAuth configured, email configured, last order/import, and recent notification/audit failures.
- **D-09:** Production smoke should be a repeatable script, not an ad-hoc transcript. It should prove public shell, auth guard, login provider visibility, and admin API guard without mutating production data unless explicitly enabled.

### Security review
- **D-10:** Phase 15 includes a focused security review of admin/API surfaces before wider sharing. Findings can become later phases rather than being forced into Phase 15 if they are large.

</decisions>

<canonical_refs>
## Canonical References

### Requirements
- `.planning/REQUIREMENTS.md` — OPS-01 through OPS-05
- `.planning/ROADMAP.md` — Phase 15 success criteria

### Prior phase context
- `.planning/phases/08-authentication/08-CONTEXT.md` — Auth.js/admin authorization model
- `.planning/phases/11-checkout-upgrade-order-history/11-01-SUMMARY.md` — checkout persistence and post-commit notification behavior
- `.planning/phases/14-inventory-audit-trail/14-02-SUMMARY.md` — audit/import history surfaces available for health context

### Current code to read before execution
- `src/app/api/checkout/route.ts` — public write endpoint
- `src/app/api/admin/**/route.ts` — admin mutation surfaces
- `src/app/api/admin/health/route.ts` — existing health surface to expand
- `src/lib/notifications.ts` — email notification behavior and failure modes
- `src/lib/auth/admin-check.ts` — admin authorization helper
- `src/db/orders.ts` and `src/db/queries.ts` — last order/import/audit data sources after Phase 14

</canonical_refs>

<code_context>
## Existing Code Insights

### Already present
- Admin APIs consistently use `requireAdmin()`.
- Checkout commits orders before notifications, so notification failure does not erase orders.
- `/api/admin/health` exists as a starting point.
- Vercel smoke checks have been run manually with `vercel curl` and production-safe unauthenticated probes.
- Phase 14 should provide audit/import history data useful for health/status.

### Risk points
- Vercel/serverless runtime makes naive in-memory rate limiting misleading.
- Production Vercel deployments may be protected, so smoke scripts need to use `vercel curl` or support a protection-bypass secret without exposing it.
- Health pages can accidentally reveal operational details. Keep public health minimal; detailed health should be admin-only.
- Structured logs can become noisy. Log state transitions and failures, not every harmless render.

</code_context>

<specifics>
## Specific Interface Sketch

### Health response

```typescript
interface AdminHealthStatus {
  ok: boolean;
  checks: {
    database: "ok" | "error";
    authSecret: "configured" | "missing";
    googleOAuth: "configured" | "missing";
    email: "configured" | "missing";
  };
  recent: {
    lastOrderAt: string | null;
    lastImportAt: string | null;
    lastAuditAt: string | null;
    notificationFailuresLast24h: number;
  };
}
```

### Production smoke script

Suggested command shape:

```bash
npm run smoke:production -- --deployment <url-or-id>
```

Default smoke should be read-only/guard-focused:
- GET home page
- GET admin login page
- assert Google sign-in is visible in production
- assert local username/password fields are hidden in production
- assert unauthenticated `/admin` redirects
- assert unauthenticated admin mutation APIs return 401

</specifics>

<deferred>
## Deferred Ideas

- External log drain or metrics vendor.
- Scheduled synthetic monitoring.
- Automatic backups.
- Payment/shipping security controls.
- Fine-grained admin roles.
</deferred>

---

*Phase: 15-production-hardening*
*Context gathered: 2026-04-27*
