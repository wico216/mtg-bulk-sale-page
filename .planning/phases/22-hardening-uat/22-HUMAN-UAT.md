---
status: pending
phase: 22-hardening-uat
source: [22-VERIFICATION.md]
started: 2026-05-11T04:00:00Z
updated: 2026-05-11T04:00:00Z
deployment_url: https://wikos-spellbinder.vercel.app
---

## Current Test

[awaiting human testing]

## Tests

### 1. Operator-on-autopilot binder picker (HARD-03 picker latency + HARD-04 picker UX)

expected: Stage 1 binder picker renders within 3 seconds of clicking Upload (HARD-03 picker latency clause via the D-09 manual UAT fallback path). The picker remembers the last selection on a re-import, surfaces the WILL DELETE panel when a previously-selected binder is missing, and the commit confirmation requires typing REPLACE before mutating.

how to run:

```bash
# Prerequisite: v1.3 deployed to wikos-spellbinder.vercel.app and operator
# is signed in to /admin/import.

# 1. Open the live admin import page in the browser:
#    https://wikos-spellbinder.vercel.app/admin/import
# 2. Open DevTools → Network tab; filter by "preview" so the NDJSON request
#    is easy to spot.
# 3. Drag-drop test-fixtures/large-export.csv (synthetic 12,749-row fixture)
#    OR a real Manabox export. Click "Upload" / "Preview".
# 4. In the Network tab, find the POST /api/admin/import/preview row. The
#    "Time" column shows total round-trip; the picker DOM appears as soon as
#    the FIRST NDJSON chunk (the `binders` message per Phase 19 D-01)
#    arrives. Stopwatch via DevTools "Waiting (TTFB)" + first-chunk arrival.
#
#    Pass criterion: picker visible within 3000ms of click.
#
# 5. Select a subset of binders (e.g., a02, a05, a07). Click "Continue".
# 6. Click "Commit Import". A confirmation modal MUST require typing the
#    word REPLACE before the Confirm button enables (Phase 19 D-06).
# 7. Type REPLACE → click Confirm. Wait for the success toast.
# 8. Re-upload the SAME CSV (drag-drop again, click Upload).
# 9. The picker MUST pre-check the previously-selected binders (a02, a05, a07
#    from step 5; Phase 19 D-04 IMP-02).
# 10. Re-upload a TRIMMED CSV that omits one previously-imported binder
#     (e.g., delete every row whose Binder Name is "a05" before re-uploading).
# 11. The picker MUST surface a WILL DELETE panel listing "a05" (Phase 19
#     D-05 IMP-04). The commit confirmation step still requires typing
#     REPLACE.
```

result: [awaiting operator]
evidence: [paste DevTools Time column screenshot or the recorded TTFB number; confirmation modal screenshot; pre-check + WILL DELETE panel screenshots]

---

### 2. v1.2 → v1.3 cart hydration (Phase 20 D-08/D-09/D-10/D-13)

expected: A buyer with a v1.2-shape cart in localStorage navigating to the v1.3 storefront sees the one-time migration toast (Phase 20 D-10). Cart items reconcile under aggregated 4-segment keys (Phase 20 D-08). Quantities clamp to current stock (Phase 20 D-09). No console errors during hydration.

how to run:

```bash
# Prerequisite: v1.3 deployed to wikos-spellbinder.vercel.app and at least
# one card is in stock with a known aggregated id.

# 1. Open https://wikos-spellbinder.vercel.app/ in a fresh incognito window.
# 2. Open DevTools → Console tab. Inject a v1.2-shape cart into the
#    persisted Zustand store. The actual key is `viki-cart` (verified via
#    src/lib/store/cart-store.ts line 79). The pre-v1.3 schema persisted
#    only `items` (no `version` field — `needsCartMigration()` flags
#    `version == null` as needing migration per Phase 20 D-13).
#
#    Paste into DevTools Console:

# v1.2 shape: items as a Map<5-segment-id, qty>; no version field.
# Substitute a real 5-segment id from the live storefront's HTML source
# (find a card whose data-card-id attribute matches the v1.2 5-segment
# shape). Example uses a synthetic placeholder.
localStorage.setItem(
  'viki-cart',
  JSON.stringify({
    state: {
      items: {
        __type: 'Map',
        entries: [['sld-1-foil-near_mint-a02', 2]],
      },
      // version intentionally omitted to mimic pre-v1.3 cart
    },
    version: 0,
  }),
);

# 3. Reload the page (Cmd-R / F5). Navigate to /cart.
# 4. EXPECTED:
#    - One-time migration toast appears (Phase 20 D-10) explaining the cart
#      was migrated to the new aggregated layout.
#    - Cart items reconcile under aggregated 4-segment keys: the v1.2
#      `sld-1-foil-near_mint-a02` should appear under its aggregated form
#      `sld-1-foil-near_mint` if the aggregated card exists in current
#      inventory. If no matching aggregated card exists, the item is silently
#      dropped (Phase 20 D-09).
#    - Quantity clamps to current available stock (Phase 20 D-09): if v1.2
#      cart asked for qty=2 but only 1 is in stock, the cart shows 1.
#    - Console MUST be free of errors during hydration.
# 5. Reload the page again. The migration toast MUST NOT re-fire (the
#    version sentinel '1.3' was advanced by markCartMigrated() on first
#    hydration; Phase 20 D-13).
```

result: [awaiting operator]
evidence: [paste console output (no errors); migration toast screenshot; before/after cart UI showing qty clamp; second-reload screenshot showing no toast]

---

### 3. CHECK constraint trip detection (Phase 16 BIND-04 + Phase 18 D-08)

expected: A row corrupted to `quantity = -1` causes the Postgres `cards_quantity_check` CHECK constraint to fire. A subsequent checkout against that aggregated key surfaces as HTTP 503 (NOT a 409 stock_conflict and NOT a silent oversell) per Phase 18 D-08. The structured log emits `checkout.constraint_violation`. The state is recoverable (a successful UPDATE to a non-negative value re-enables checkouts).

how to run:

```bash
# WARNING: NEVER run the UPDATE below against the production database.
# Run only against a Neon SANDBOX branch with disposable test data.

# 1. In Neon dashboard: create a Branch from production (or use an existing
#    sandbox branch). Open the branch's SQL Editor.
#
# 2. Insert a sandbox test card (substitute a unique aggregated id):

INSERT INTO cards (id, name, set_code, set_name, collector_number, condition,
                   finish, binder, rarity, quantity, price)
VALUES ('tst-99999-normal-near_mint-sandbox', 'Sandbox Card',
        'tst', 'Sandbox Set', '99999', 'near_mint', 'normal',
        'sandbox', 'common', 5, 1.00);

# 3. Try to corrupt the row to quantity = -1. The CHECK constraint MUST fire:

UPDATE cards SET quantity = -1
WHERE id = 'tst-99999-normal-near_mint-sandbox';

# Expected error from Neon: ERROR: new row for relation "cards" violates
# check constraint "cards_quantity_check" (Phase 16 BIND-04).
#
# 4. To force the 503 path on the live route, simulate the constraint trip
#    DIFFERENTLY: deploy a sandbox version of the app pointing at this Neon
#    branch (or use a v1.3 staging URL), then attempt a checkout against
#    the aggregated key with a quantity that would push stock negative
#    given a deliberately-poisoned starting count. The simpler proof is
#    structural: the test `src/db/__tests__/schema.test.ts` line 58
#    pins the CHECK constraint declaration, and Phase 18 D-08's catch-block
#    in `src/db/orders.ts` is unit-tested by `placeCheckoutOrder` returning
#    an error result (NOT throwing) on constraint violation.
#
# 5. Verify the constrained-state recovery:

UPDATE cards SET quantity = 5
WHERE id = 'tst-99999-normal-near_mint-sandbox';
# Should succeed (quantity >= 0).

# 6. Cleanup:

DELETE FROM cards WHERE id = 'tst-99999-normal-near_mint-sandbox';

# 7. Verify the structured log entry surfaces in Vercel function logs OR by
#    inspecting the response body's error code field on a triggered 503.
#    Search Vercel logs for `checkout.constraint_violation`.
```

result: [awaiting operator]
evidence: [Neon SQL editor screenshot showing the CHECK violation error; Vercel logs screenshot showing checkout.constraint_violation; cleanup confirmation]

---

### 4. Public-page binder leak grep (I-DISC-05 / AGG-02)

expected: The live storefront, cart page, and checkout API responses (both success and stock_conflict shapes) contain ZERO references to any binder name from the operator's collection. Verifies Phase 20 D-05/D-07 type-split + Phase 18 D-06 SUM-across-binders behavior at the live deployment level (the unit-level invariant tests in `src/app/__tests__/page-invariant.test.ts` and `src/app/cart/__tests__/page-invariant.test.ts` and `src/app/api/checkout/__tests__/route.test.ts` pin the same property in CI).

how to run:

```bash
# Prerequisite: v1.3 deployed and at least one in-stock card available for
# a successful POST /api/checkout (substitute a real aggregated id from the
# live storefront in the success-shape POST). For the stock-conflict POST,
# use a deliberately-too-large quantity to force the 409 path.

# 1. Capture all four public response bodies:

curl -sS https://wikos-spellbinder.vercel.app/ \
  | tee /tmp/store.html

curl -sS https://wikos-spellbinder.vercel.app/cart \
  | tee /tmp/cart.html

# Success-shape checkout (substitute a real aggregated id + ensure qty fits
# current stock):
curl -sS -X POST https://wikos-spellbinder.vercel.app/api/checkout \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"cardId":"<REAL-AGGREGATED-ID>","quantity":1}],
       "buyerName":"t","buyerEmail":"t@t.com","message":""}' \
  | tee /tmp/checkout-success.json

# Stock-conflict-shape checkout (deliberately oversize quantity):
curl -sS -X POST https://wikos-spellbinder.vercel.app/api/checkout \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"cardId":"<REAL-AGGREGATED-ID>","quantity":99999}],
       "buyerName":"t","buyerEmail":"t@t.com","message":""}' \
  | tee /tmp/checkout-conflict.json

# 2. Grep ALL binder names from the operator's actual binder set against
#    all four captured bodies. The operator substitutes their binder names
#    here. The example below uses a01..a14 + 'bulk drawers' + 'unsorted'
#    as the documented operator binder set per STATE.md cross-cutting
#    constraints; substitute as needed:

grep -i -E '(a01|a02|a03|a04|a05|a06|a07|a08|a09|a10|a11|a12|a13|a14|bulk drawers|unsorted)' \
  /tmp/store.html /tmp/cart.html \
  /tmp/checkout-success.json /tmp/checkout-conflict.json

# Pass criterion: the grep returns NO LINES (exit 1 from grep means no
# matches found, which is the expected pass state). Any hit is a leak.
```

result: [awaiting operator]
evidence: [paste the empty grep output (or the exit code 1 indicator); paste the head of /tmp/checkout-success.json showing PublicOrderItem shape (no `binder` field) and StockConflict shape (4-segment cardId, no per-binder breakdown)]

---

### 5. Multi-binder concurrent checkout (HARD-01 live verification)

expected: A burst of 5 simultaneous checkouts against a sandbox card whose stock is split across 2 binders (e.g., `a02:2 + a05:1` totaling 3) produces exactly 3 successes (HTTP 200) and exactly 2 stock_conflicts (HTTP 409). The SUM(quantity) across both binder rows is 0 after the burst (winner empties both sources). No row has `quantity < 0` (the CHECK constraint trip would surface as 503 — distinct from 409 — so distinguishable in the result counts).

how to run:

```bash
# WARNING: requires a Neon SANDBOX branch + a v1.3 staging deployment
# pointed at that branch (or operator chooses to seed + cleanup against
# production with synthetic data — risky; sandbox is preferred).
# NEVER run this burst against production checkout for a real card.

# 1. In the sandbox Neon SQL editor, seed a test card split across 2 binders:

INSERT INTO cards (id, name, set_code, set_name, collector_number, condition,
                   finish, binder, rarity, quantity, price)
VALUES
  ('tst-9999-normal-near_mint-a02', 'Concurrent Test Card',
   'tst', 'Concurrent Test', '9999', 'near_mint', 'normal',
   'a02', 'common', 2, 1.00),
  ('tst-9999-normal-near_mint-a05', 'Concurrent Test Card',
   'tst', 'Concurrent Test', '9999', 'near_mint', 'normal',
   'a05', 'common', 1, 1.00);

# 2. Fire 5 simultaneous POSTs to /api/checkout against the AGGREGATED key
#    (4-segment, no binder segment). Each requests qty=1.
#    Substitute the staging URL.

for i in $(seq 1 5); do
  curl -sS -o /tmp/checkout-burst-$i.json -w "%{http_code}\n" \
    -X POST https://<staging-url>/api/checkout \
    -H 'Content-Type: application/json' \
    -d '{"items":[{"cardId":"tst-9999-normal-near_mint","quantity":1}],
         "buyerName":"buyer-'$i'","buyerEmail":"b'$i'@t.com","message":""}' &
done
wait

# 3. Count the response codes. Expected: exactly 3x 200 + 2x 409.
#    Run this after the bursts finish:

for i in $(seq 1 5); do
  echo -n "Run $i: "
  cat /tmp/checkout-burst-$i.json | head -c 50
  echo
done

# 4. Verify SUM(quantity) = 0 across both binder rows in the Neon SQL editor:

SELECT COALESCE(SUM(quantity), 0)::integer AS total_remaining
FROM cards
WHERE set_code = 'tst' AND collector_number = '9999';
# Expected: total_remaining = 0.

# 5. Verify no row has quantity < 0 (the CHECK trip would fail as 503 NOT
#    409, but defense-in-depth):

SELECT id, quantity FROM cards
WHERE set_code = 'tst' AND collector_number = '9999';
# Expected: both rows show quantity = 0.

# 6. Cleanup:

DELETE FROM order_items WHERE set_code = 'tst' AND collector_number = '9999';
DELETE FROM orders WHERE id IN (
  SELECT order_id FROM order_items
  WHERE set_code = 'tst' AND collector_number = '9999'
);
DELETE FROM cards WHERE set_code = 'tst' AND collector_number = '9999';
```

result: [awaiting operator]
evidence: [paste the 5 HTTP status codes; paste the SUM(quantity) result showing 0; paste the per-row quantity result showing both rows at 0]

---

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
