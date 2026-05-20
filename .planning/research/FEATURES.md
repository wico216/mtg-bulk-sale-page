# Feature Research — v1.4 Import UX & Price Refresh

**Domain:** Personal e-commerce (single-operator MTG bulk store) — import workflow UX + scheduled inventory price refresh
**Researched:** 2026-05-20
**Confidence:** MEDIUM-HIGH (binder picker UX backed by NN/g + Helios + PatternFly conventions; Vercel Cron + Scryfall constraints backed by official docs)

## Scope Reminder

This is v1.4 of a **personal-scale** MTG store for a friend group, not a Shopify clone. v1.3 already shipped the heavy lifting (two-stage NDJSON binder picker, allocator, audit log, `/admin/health`). v1.4 only adds:

1. **Select-All / Deselect-All buttons** on the existing binder picker, with **default = all deselected** (explicit opt-in).
2. **Daily Vercel Cron price refresh** with audit log + `lastPriceRefreshAt` on `/admin/health` + manual "Refresh now" escape hatch.

Target: 2 phases, 3-5 days. Anti-features are the load-bearing section of this document — most "obvious next steps" are scope creep for a friend store.

---

## Feature 1 — Import Binder Picker: Select All / Deselect All

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Two action controls labeled "Select all" / "Deselect all"** | Standard pattern across PatternFly, Helios (HashiCorp), GitLab Pajamas, eBay Playbook for bulk-action lists. Users expect to see both verbs explicitly when the list has >5 items. | LOW | Wire to the same setter as individual checkboxes; reuse v1.3 `binder-picker.tsx` reducer. Place buttons inline above the checkbox list, left-aligned to the column. |
| **"X of Y selected" counter near the buttons** | Operator needs to confirm intent before pressing REPLACE. v1.3 already shows per-binder counts; an aggregate "3 of 12 binders / 4,217 cards selected" line closes the loop. | LOW | Single derived value from existing selection state. Renders inline next to Select/Deselect buttons. |
| **Default state = ALL DESELECTED on every open** | Operator's stated motivation. v1.3 already does this for `unsorted` binder (Phase 16 D-10 / D-13). Generalizes the same "explicit opt-in" principle to every binder. Eleken + GitLab Pajamas + NN/g all converge: destructive bulk ops should make the user *choose* the scope, not the system. | LOW | Flip the initial reducer state in `binder-picker.tsx` from `Set(allBinderNames)` to `new Set()`. The two-stage NDJSON contract is unchanged; only the initial selection differs. Remove the v1.3 "remembered selection" behavior (or keep it strictly within a single import session). |
| **Disabled-state semantics on the REPLACE button when 0 selected** | Without this, "Deselect all" → REPLACE → typed confirm → DELETE 0 rows is a footgun against operator muscle memory. | LOW | Existing inline destructive confirmation already exists; just gate the typed-REPLACE-phrase input behind `selectedCount > 0`. |
| **Will-delete preview stays accurate as selection changes** | v1.3 already computes this; it just needs to react to the new bulk toggles. | LOW | No new code path; existing memoization handles it. |

### Differentiators (Competitive Advantage — Personal Store Edition)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Indeterminate state on a master checkbox row** | NN/g, MUI, PatternFly all describe this as the canonical pattern. The master checkbox shows `-` when *some* binders selected, `✓` when *all*, empty when *none*, and clicking it toggles between "all" and "none". | MEDIUM | This is the **alternative** to two separate buttons. Decision recommended below in "Open question." |
| **Persist selection only within the current import session (not across imports)** | v1.3 currently remembers selection across imports — that's the autopilot risk operator wants to break. Scoping memory to "this import preview only" preserves "fix typo, re-preview, keep picks" without enabling "press the same buttons in your sleep next month." | LOW | Drop the localStorage key; keep selection in React state only. |
| **NEW binders sort to top (already exists)** | v1.3 already sorts NEW binders with a green pill. With deselect-by-default, this becomes *more* useful — the operator's eye lands on what they almost certainly want to import. No code change. | n/a | Already shipped. Just note it interacts well with the new default. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **"Smart Select: NEW only" as a third button** | Looks elegant; "select the binders that don't exist yet." | Scope creep. Operator already sees NEW binders sorted to top with green pills — visual scanning + click is ~2 seconds. Adding a third button introduces a third mental model ("what counts as new?"), a third truthiness branch in the reducer, and a third test case. For a friend store with <30 binders, it saves zero meaningful time. NN/g + Eleken both warn: "many people know how to use checkboxes — keep things as simple as possible." | **DO NOT BUILD.** If operator finds NEW-only useful after 3 months of v1.4 in production, reconsider in v1.5. Defer with a one-line note in PROJECT.md "Out of Scope." |
| **"Smart Select: replace only existing"** | Inverse of NEW-only. | Same scope-creep argument; even worse signal-to-noise because "existing" is the default mental category. | DO NOT BUILD. |
| **Keyboard shortcut (`Cmd-A` / `Ctrl-A`)** | "Power user" appeal. | Conflicts with browser-native "select all text" inside the same page. Operator imports cards <weekly. Zero ROI vs. the risk of stomping a familiar shortcut. | Just use the visible button. If operator ever asks for it explicitly, add `aria-keyshortcuts` and a visible hint then. |
| **Per-binder Select-All for sub-items** | The picker currently selects whole binders, not individual cards. Sub-selection would be a different feature entirely. | Would require a card-level picker UI that doesn't exist. v1.3 deliberately picks at the binder boundary because Manabox exports are organized that way. | Out of scope — possibly never. The Manabox-binder boundary is the operator's mental model. |
| **Saved "selection presets"** | "I always import my Modern + Pioneer binders together." | Premature optimization for a friend store. Three Manabox imports per month × 2 seconds of clicking = 6 seconds/month. Building presets = >2 hours of work. | DO NOT BUILD. |
| **Multi-step wizard for the import flow** | Some bulk-action UX articles suggest a wizard. | v1.3's inline panel already lives on one page with a typed-REPLACE confirmation. A wizard adds friction without adding safety. Operator already explicitly types REPLACE. | Keep the inline pattern. |

### Open Question: Buttons vs. Master Checkbox

Two valid patterns. Picking one matters for consistency.

**Recommendation: Two buttons ("Select all" / "Deselect all") above the list.**

Reasons:
1. The v1.3 picker is **not a table** — it's a column of named checkboxes with badges and counts. The "master checkbox on a column header" pattern (Helios, PatternFly) presumes tabular layout. Forcing a master checkbox into a non-table layout creates ambiguity about *what column* it controls.
2. Buttons are an *action* (transitive — "do this now"), checkboxes are a *state*. Operator wants explicit *actions* to break autopilot habit. NN/g notes that for destructive contexts, action verbs read more decisively than toggle states.
3. The operator's mental model after deselect-by-default is "I am opting in to specific binders." Two named buttons reinforce that. A master checkbox with indeterminate state is more abstract.
4. Lower implementation complexity: no indeterminate-state logic, no tri-state ARIA work.

**Counter-arguments** (for completeness):
- A master checkbox is more space-efficient (one row vs. two buttons + counter).
- It's the pattern of every email client.

**Verdict:** Buttons win on this list because the list is not a table and clarity > density for a destructive action. (Confidence: MEDIUM — operator can override.)

---

## Feature 2 — Daily Price Refresh

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Vercel Cron daily schedule at off-peak (recommend 04:00 UTC ≈ 21:00 PT / 23:00 CT)** | Scryfall refreshes prices from affiliates once per 24h. Running before North American morning means buyers see fresh prices when browsing. Off-peak = lower 429 risk if Scryfall is restarting workers. | LOW | `vercel.json` cron entry: `{"path": "/api/cron/refresh-prices", "schedule": "0 4 * * *"}`. Free tier supports daily cron. |
| **Authorization on the cron endpoint (CRON_SECRET header check)** | Vercel docs require this for paid plans; on free tier it's still load-bearing for defense-in-depth. Without it, anyone who guesses the path can trigger expensive Scryfall traffic. | LOW | Read `process.env.CRON_SECRET`, compare against `Authorization: Bearer ${CRON_SECRET}` header. Vercel injects this automatically when configured. Same pattern as v1.2 admin route auth. |
| **Idempotency: running twice in 24h is safe** | Vercel explicitly warns crons can fire more than once for a single scheduled trigger. Two refreshes back-to-back must not corrupt prices or double-write audit rows. | MEDIUM | Two layers: (a) Scryfall is the source of truth — second fetch returns same prices, so `UPDATE` is a no-op for "unchanged"; (b) gate with an advisory lock OR check "did a `price_refresh` audit row land in the last N minutes? skip if yes" early in the handler. Recommend the audit-row guard (1 SQL query, no lock-leak risk). |
| **Partial-failure tolerance: some cards 404 (e.g. rotated set, typo'd collector number)** | Manabox exports occasionally produce cards Scryfall doesn't recognize (alt-art mismatches, miscut collector numbers). One bad card must not kill the whole run. | MEDIUM | Existing v1.3.1 batched `/cards/collection` already returns `not_found` array per batch — treat that as `failed` count, log card identifiers in audit metadata (bounded), continue. The endpoint accepts up to 75 identifiers per call; chunk accordingly. |
| **One `admin_audit_log` row per run with counts** | Operator's explicit requirement. Schema already supports it (v1.2 Phase 14). Counts: `{updated, unchanged, failed}` + duration ms + Scryfall-batch count. | LOW | New audit kind `price_refresh` with `ScopedPriceRefreshMetadata`. Reuse the bounded-metadata pattern from v1.3 import audit. Stays under 4KB cap easily. |
| **`lastPriceRefreshAt` on `/admin/health`** | Operator's explicit requirement. v1.2 already returns literals — extend the shape with a timestamp value (this is operator-only data, not env config). | LOW | New `MAX(created_at) FROM admin_audit_log WHERE kind = 'price_refresh'` parallel query, returned as ISO-8601 string or `null`. Add a row to the existing health page table. |
| **Manual "Refresh now" admin button** | Escape hatch for "I imported a new binder, prices are stale until tomorrow's 04:00 UTC." Operator's explicit requirement. | LOW | Add a button to `/admin` (or `/admin/health`) that POSTs to the same handler logic the cron uses. Rate-limit with `ADMIN_BULK` (20/min — already exists). |
| **Timeout-safe execution** | Scryfall `/cards/collection` batched at 75 ids × ~12k rows = ~170 batches × ~200ms = ~35s. Comfortably under Vercel Pro 300s, but operator is on Hobby (10s) → would fail. | MEDIUM | Two options: (a) **Move to Vercel Pro for cron-only** (adds cost — violates budget constraint), (b) **Stream-and-update**: chunk into multiple cron invocations that each handle a slice with a cursor. Recommend a third option: **deploy on Pro only if needed**; for ~12k rows at neon-http latency, profile first. Alternatively the cron route uses `export const maxDuration = 300` (works on Pro) and falls back to a 10s budget on Hobby (process N batches, persist progress, schedule continuation). **Document the budget assumption explicitly.** |

### Differentiators (Competitive Advantage — Personal Store Edition)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Audit metadata includes per-card "biggest movers"** | Operator can see "Wrath of God +$0.42, Cultist of the Absolute -$0.18" at a glance. Helpful for spotting spikes worth a manual price-check before tomorrow's friends arrive. | MEDIUM | Bound to top-5 movers (absolute Δ price) to stay under audit-row size cap. Optional — drop if it stretches Phase 2 of v1.4. |
| **`/admin/health` shows "X cards updated, Y failed" from the most recent run** | One extra audit-row read; surfaces "last run was unhealthy" at a glance without going to `/admin/audit`. | LOW | Extend the health JSON shape with `lastPriceRefresh: { at, updated, unchanged, failed }`. |
| **Manual refresh button disabled for 60s after a successful run** | Prevents operator from spamming Scryfall by repeatedly clicking. Soft-stop in the UI; rate limit is the hard-stop. | LOW | Client-side `lastRefreshAt` from the same audit query; disable button + show "Refreshed 12s ago" text. |
| **Refresh button shows progress while running** | A 30-second wait with no feedback feels broken. NDJSON streaming (already used in v1.3 import) gives "Batch 14/170, 1,053 cards updated…" | MEDIUM | Reuses the v1.3 NDJSON pattern. **Recommended only if** the operator says the silent button feels broken in UAT. Otherwise defer. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Real-time price tickers / live updates on storefront** | "Friends should see fresh prices instantly!" | (1) Scryfall itself only refreshes prices once per 24h — a real-time ticker is theater, not signal. (2) Adds websocket infra or constant polling — violates "personal tool, not business platform" constraint. (3) Friends pay in person, so price drift between browse and checkout is a 5-second conversation, not a lawsuit. | DO NOT BUILD. Daily refresh is enough. Document in PROJECT.md "Out of Scope" if not already. |
| **Per-card price-change emails to buyers** | "Tell buyers when a card on their wishlist drops!" | (1) There's no wishlist feature. (2) There are no user accounts (out-of-scope decision since v1.0). (3) Email cost (Resend) scales linearly with this. (4) Friends ≠ retail customers; the right channel is Discord/SMS. | DO NOT BUILD. If wishlists are ever requested, that's a v2.0 conversation. |
| **Automated repricing based on margin / floor rules** | TCG Automation, TCG Sync, and TCGplayer Pro all offer this. | Viki's prices come straight from Scryfall ("market price" via TCGplayer affiliate). The operator isn't running margin strategy — they're listing bulk for friends at market. Repricing engines are for >$10k inventories where 2% margin matters. | DO NOT BUILD. Pass-through Scryfall pricing is the design. |
| **Multi-source pricing (Scryfall + Cardmarket + JustTCG fallback)** | "What if Scryfall is down?" | Scryfall has been more reliable than the operator's own deploy. Multi-source pricing requires reconciliation logic, currency conversion (Cardmarket is EUR), and source-priority rules. For a friend store: if Scryfall is down on the 04:00 UTC run, prices stay stale one extra day. That's fine. | DO NOT BUILD. The audit row will record `failed > 0`; operator can retry manually tomorrow. |
| **Price-history graphs on the storefront** | Looks cool. Lots of TCG tools have it. | Requires a `price_history` table, retention policy, chart library, mobile breakpoints. v1.4 is supposed to be 2 phases. | DO NOT BUILD in v1.4. Could be a future v1.5+ feature if the operator hears friends ask "how much was this last week?" — until then, no signal. |
| **Cron run failure → Discord/email alert to operator** | "I want to know if the job failed." | The `/admin/health` page already exists. Operator can check it during normal admin sessions. Adding an alert channel = new env var, new Resend template, new failure mode (alert-on-alert). For a daily-frequency job that's allowed to skip a day: overengineered. | Surface `lastPriceRefreshAt` staleness on `/admin/health` (already required). If it's >36h old, render a yellow badge. Cheaper, no new vendor. |
| **Price-drop notification banner on storefront** | "Show buyers what's on sale today!" | Implies a notion of "sale price" vs "list price" which doesn't exist in the data model. Adds noise — buyers want to browse, not be marketed to. Friend-store voice is conversational, not promotional. | DO NOT BUILD. |
| **Refresh per-binder or per-set** | "What if I only want to refresh Modern cards?" | Scryfall batches by id, not by set. Per-binder refresh = same number of API calls, more complex UI. Daily-refresh-all is simpler and correct. | DO NOT BUILD. Manual "Refresh now" button refreshes everything; that's the operator's only escape hatch and that's enough. |
| **Concurrent / parallel Scryfall fetches** | "Faster!" | Scryfall's documented rate limit is 10 req/s. v1.3.1 already batches 75 ids/call, so ~170 sequential calls fits inside the limit. Parallelism risks 429 + the 30s lockout, which would make every run unreliable. | Keep sequential batches with the existing 100ms+ delay (Scryfall's recommendation). |

---

## Feature Dependencies

```
[Daily Cron Schedule] ──requires──> [Vercel Cron config in vercel.json]
                                          └──requires──> [CRON_SECRET env var]

[Daily Cron Schedule] ──requires──> [Cron handler route]
                                          └──requires──> [Idempotency guard (recent-audit-row check)]
                                          └──requires──> [Existing batched Scryfall /cards/collection client]

[Cron handler] ──writes──> [admin_audit_log row, kind='price_refresh']
                                          └──surfaced by──> [/admin/health lastPriceRefreshAt]

[Manual "Refresh now" button] ──reuses──> [Same cron handler logic, behind requireAdmin()]
                                          └──gated by──> [Existing ADMIN_BULK rate limit]

[Select-All / Deselect-All buttons] ──reads/writes──> [binder-picker.tsx selection Set]
                                          └──interacts with──> [v1.3 two-stage NDJSON contract — unchanged]

[Default = all deselected] ──conflicts with──> [v1.3 "remembered selection across imports"]
                                          └──resolution──> [Drop cross-import memory; keep within-session only]
```

### Dependency Notes

- **Cron handler is shared between scheduled + manual triggers.** Single source of truth — the manual button POSTs to the same path/logic the cron uses (or to a thin wrapper that calls the same function). This is the single most load-bearing architectural decision for Feature 2.
- **Idempotency guard runs BEFORE the Scryfall fetch.** If an audit row exists with `kind='price_refresh'` and `created_at > now() - interval '5 minutes'`, return early with 200 + a "skipped: recent run exists" payload. Prevents Vercel double-delivery from costing Scryfall traffic.
- **`/admin/health` change is additive.** v1.2 Phase 15's "literals only" rule applies to *env config*. A timestamp + counts from the operator's own audit log is operator-visible data, not env state — adding it does not violate the rule. Keep the rule unchanged for env values.
- **Drop the v1.3 cross-import memory.** Currently `binder-picker.tsx` persists selection across import sessions; this directly contradicts "default deselected." Resolution: remove the cross-session persistence layer (likely localStorage). Selection state lives only inside one import preview's React component tree.

---

## MVP Definition (v1.4 only)

### Launch With (v1.4)

These are the operator's stated requirements. Nothing more.

- [ ] **Select All / Deselect All buttons on the binder picker** — explicit opt-in to break autopilot.
- [ ] **Default selection = none** — every binder unchecked on every open.
- [ ] **Vercel Cron daily price refresh at 04:00 UTC** — daily Scryfall refetch.
- [ ] **`admin_audit_log` row per run** — `{updated, unchanged, failed}` counts + duration.
- [ ] **`lastPriceRefreshAt` on `/admin/health`** — observability surface.
- [ ] **Manual "Refresh now" button** in admin — escape hatch, rate-limited.
- [ ] **Idempotency guard** — recent-audit-row check at handler top to absorb Vercel double-delivery.
- [ ] **Partial-failure tolerance** — Scryfall 404s recorded in `failed` count, run continues.

### Add After Validation (v1.4.x)

Only if operator finds them missing during UAT.

- [ ] **Staleness badge on `/admin/health`** — yellow if `lastPriceRefreshAt > 36h` ago. Trigger: operator misses a failed run because the timestamp is just text.
- [ ] **Top-5 movers in audit metadata** — surfaced on `/admin/audit`. Trigger: operator wants more signal than counts.
- [ ] **Disabled-state semantics on manual refresh** — "Refreshed 12s ago" + 60s cooldown. Trigger: operator double-clicks during testing.

### Future Consideration (v1.5+ or never)

Only if the friend-store nature shifts (and it probably won't).

- [ ] **NDJSON streaming progress for manual refresh** — visual feedback during 30s wait. Only if operator says the silent button feels broken.
- [ ] **Smart Select: NEW only** — third button on the picker. Only if operator says NEW-sort isn't enough after 3 months.
- [ ] **Price history table + storefront graphs** — separate milestone entirely; would only happen if friends ask "what was this last week?"

### Out of Scope (Reaffirmed)

Already out of scope in PROJECT.md; v1.4 does not change that.

- [ ] **Real-time price tickers** — daily refresh is the contract.
- [ ] **Buyer wishlists / price-drop emails** — no user accounts (v1.0 decision).
- [ ] **Automated repricing** — pass-through Scryfall, no margin engine.
- [ ] **Multi-source pricing fallback** — Scryfall is sufficient.
- [ ] **Saved selection presets** — friend store, not a SaaS workflow.

---

## Feature Prioritization Matrix (v1.4 Items Only)

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Default = all binders deselected | HIGH (operator's stated #1 motivation) | LOW (flip one initial state) | P1 |
| Select All / Deselect All buttons | HIGH (counterbalances deselect-default) | LOW (two buttons + counter) | P1 |
| Daily Vercel Cron refresh | HIGH (operator's stated #2 motivation) | MEDIUM (cron config + handler + idempotency) | P1 |
| `admin_audit_log` row per run | HIGH (observability + operator requirement) | LOW (existing audit infra) | P1 |
| `lastPriceRefreshAt` on `/admin/health` | HIGH (operator requirement) | LOW (one MAX query) | P1 |
| Manual "Refresh now" button | MEDIUM (escape hatch, low frequency) | LOW (reuse cron handler) | P1 |
| Idempotency guard | HIGH (correctness; Vercel double-delivery is documented behavior) | LOW (one audit-row check) | P1 |
| Partial-failure tolerance | HIGH (Scryfall 404s happen) | LOW (existing batch returns `not_found`) | P1 |
| Drop cross-import selection memory | MEDIUM (consistency with new default) | LOW (remove localStorage hook) | P1 |
| Staleness badge on `/admin/health` | MEDIUM | LOW | P2 |
| Top-5 movers in audit | LOW (nice-to-have) | MEDIUM | P3 |
| Manual-refresh cooldown UI | LOW (defensive UX) | LOW | P3 |
| NDJSON streaming progress | LOW (no signal it's needed) | MEDIUM | P3 |

**Priority key:**
- P1: Must have for v1.4 launch
- P2: Should have, fold in if Phase 2 has slack
- P3: Nice to have, defer to v1.4.x or never

---

## Reference Patterns (How Larger Players Do This — For Calibration Only)

| Feature | Shopify | TCGplayer Pro / TCG Sync | Viki's Approach |
|---------|---------|--------------------------|-----------------|
| Bulk price update scheduling | Shopify Flow scheduled trigger (≥10min granularity); bulk price-edit apps for cross-product runs | Continuous repricing with margin rules per category | Daily cron, Scryfall pass-through, no margin logic |
| Manual trigger | Admin runs "Now" on a Flow workflow; apps add explicit "Run job" buttons | One-click "reprice all" | Single admin button on `/admin/health` or `/admin` |
| Job audit / run history | Shopify Flow has a "runs" page with per-run status + duration; bulk-edit apps show job tables | Per-job run logs with item counts | Reuse `admin_audit_log` (single row per run); browse via `/admin/audit` |
| Failure alerting | Shopify Flow surfaces failed runs in admin; some apps email on failure | In-app dashboards; some email | Staleness badge on `/admin/health` (no email alerts) |
| Price-history retention | Apps offer history + rollback | Yes, weeks-to-months retention | Not built. Audit log captures `updated` count per day — coarse-grained but sufficient |

The pattern across all of these: scheduled job + run history table + manual trigger + observability surface. Viki implements exactly that shape, at the smallest scale the operator's requirements support. Anything else from these tools is enterprise functionality for businesses, not friend stores.

---

## Sources

- [PatternFly — Bulk selection pattern](https://www.patternfly.org/patterns/bulk-selection/) — buttons + counter convention for bulk-action lists
- [Helios Design System (HashiCorp) — Table multi-select](https://helios.hashicorp.design/patterns/table-multi-select) — master checkbox + indeterminate state in tables
- [GitLab Pajamas — Destructive actions](https://design.gitlab.com/patterns/destructive-actions/) — confirmation + reversibility patterns
- [Nielsen Norman Group — Checkboxes: Design Guidelines](https://www.nngroup.com/articles/checkboxes-design-guidelines/) — indeterminate state semantics
- [Nielsen Norman Group — Dangerous UX: Consequential Options Close to Benign Options](https://www.nngroup.com/articles/proximity-consequential-options/) — Fitts' Law applied to destructive actions
- [Eleken — Checkbox UX best practices](https://www.eleken.co/blog-posts/checkbox-ux) — keep checkbox UI simple, master-checkbox patterns
- [Eleken — Bulk action UX: 8 design guidelines](https://www.eleken.co/blog-posts/bulk-actions-ux) — destructive bulk-action confirmation patterns
- [eBay Playbook — Bulk Editing pattern](https://playbook.ebay.com/design-system/patterns/bulk-editing) — destructive bulk-edit confirmation conventions
- [Vercel — Cron Jobs documentation](https://vercel.com/docs/cron-jobs) — cron schedule syntax, free-tier daily limit
- [Vercel — Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs) — idempotency requirement, double-delivery warning, retry guidance
- [Vercel — Troubleshooting Vercel Cron Jobs](https://vercel.com/kb/guide/troubleshooting-vercel-cron-jobs) — timeout limits per plan (10s Hobby / 300s Pro)
- [Scryfall API — Rate Limits](https://scryfall.com/docs/api/rate-limits) — 10 req/s, 30s lockout on 429
- [Scryfall API — Bulk Data Files](https://scryfall.com/docs/api/bulk-data) — "prices are dangerously stale after 24h"
- [Scryfall FAQs — Where do Scryfall prices come from?](https://scryfall.com/docs/faqs/where-do-scryfall-prices-come-from-7) — 24h affiliate-sync model
- [AppMaster — Audit logging for internal tools](https://appmaster.io/blog/audit-logging-internal-tools-activity-feed) — scheduled jobs as a common audit-gap surface
- [Shopify Help Center — Scheduled time trigger](https://help.shopify.com/en/manual/shopify-flow/reference/triggers/scheduled-time) — calibration point for scheduled-job patterns at scale
- [TCG Automation](https://www.tcg-automation.com/products/tcg-automation-landing-page) — calibration for what "automated repricing" looks like at scale (and why Viki shouldn't do it)
- [TCG Sync — Storefront Pro](https://tcgsync.com/) — same calibration point

---

*Feature research for: v1.4 Import UX & Price Refresh (subsequent-milestone scoping)*
*Researched: 2026-05-20*
