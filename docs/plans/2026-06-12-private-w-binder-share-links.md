# Private W Binder Share Links

Project: Private W Binder Share Links
Goal: Wiko can create revocable private magic links from the admin W-binders page so selected people can browse W binders in a store-like read-only view.
Non-goals: No public exposure of W binders on `/` or `/new`; no checkout; no inventory decrement; no guest admin accounts; no marketplace/multi-seller scope.
Safety constraints: W-binder data remains excluded from public storefront/cart/checkout. Shared links validate an unguessable token hash, can be revoked/expired, and never grant `/admin` access. Link tokens are stored hashed in the database.
Success proof: focused unit/component/route tests for token create/revoke/resolve, shared route rendering, invalid/expired/revoked rejection, admin auth on management API, and public W-exclusion guards; lint/test/build real output; PR CI green.

## Discovery

- Current W-binder route: `src/app/admin/w-binders/page.tsx` requires `auth()` + `isAdminEmail()` and loads `getPrivateWBinderCardsAggregated()` / `getPrivateWBinderCardsMeta()`.
- Current W-binder shell: `src/app/admin/w-binders/_components/admin-w-binders-shell.tsx` reuses `StorefrontShell` with a private pick-list controller (`useWBinderPickStore`) so it does not touch public satchel state.
- Current data safety: `src/lib/binder-scope.ts` marks normalized binders starting with `w` as private; `src/db/queries.ts` has separate `PUBLIC_SALE_BINDER_SQL` and `PRIVATE_W_BINDER_SQL` paths. Public aggregate/meta/recent queries exclude W binders, and the private admin query includes only W binders.
- Current schema/migrations: `src/db/schema.ts` uses Drizzle `pgTable`; the project uses idempotent manual `tsx scripts/migrate-*.ts` scripts, exposed through `package.json` scripts, not generated SQL migrations.
- Current admin API convention: route handlers call `requireAdmin()`, use JSON responses, and rate-limit admin mutations where relevant.
- Shared route should reuse storefront components but pass a separate controller/store so guests can stage an interest list without accessing checkout/cart.

## Implementation slice

1. Add `binder_share_links` schema and idempotent migration script.
2. Add `src/lib/w-binder-share-links.ts` for token generation/hashing, validation, normalization, and DB operations.
3. Add admin API at `/api/admin/w-binder-share-links`:
   - `GET`: list links without raw tokens.
   - `POST`: create link and return raw URL/token only once.
4. Add admin API at `/api/admin/w-binder-share-links/[id]`:
   - `DELETE`: revoke link.
5. Add admin share manager UI inside `/admin/w-binders` shell.
6. Add shared read-only route `/share/w-binders/[token]` with invalid/expired/revoked -> `notFound()`.
7. Add shared viewer shell with local guest interest list + copyable text list, no checkout.

## Risks / guardrails

- Token leakage: never store raw token; only return it at creation time.
- Public data boundary: shared W route intentionally shows binder labels to selected viewers, but no other public routes should include binders.
- Revocation semantics: revoked/expired links must stop resolving server-side, not just hide UI.
- Migration rollout: app code that references the table requires the migration before production use of the feature. The migration is additive and rollback can leave the table unused or drop it if necessary.
