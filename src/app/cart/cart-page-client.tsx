"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import type { PublicCard } from "@/lib/types";
import {
  useCartStore,
  markCartMigrated,
  needsCartMigration,
} from "@/lib/store/cart-store";
import CartItem from "@/components/cart-item";
import CartSummaryBar from "@/components/cart-summary-bar";
import { CartMigrationToast } from "@/components/cart-migration-toast";

interface CartPageClientProps {
  cards: PublicCard[];
}

export default function CartPageClient({ cards }: CartPageClientProps) {
  const items = useCartStore((s) => s.items);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const clearCart = useCartStore((s) => s.clearCart);
  const totalItems = useCartStore((s) => s.totalItems());

  // Hydration guard: prevent "Your cart is empty" flash before localStorage loads
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const finishHydration = () => queueMicrotask(() => setHydrated(true));
    const unsub = useCartStore.persist.onFinishHydration(finishHydration);
    if (useCartStore.persist.hasHydrated()) finishHydration();
    return unsub;
  }, []);

  // v1.3 Phase 20 D-12: one-time migration toast visibility.
  const [showMigrationToast, setShowMigrationToast] = useState(false);

  // Inline empty-the-satchel confirmation (replaces window.confirm so the
  // step matches the page's theme and stays keyboard-friendly).
  const [confirmingClear, setConfirmingClear] = useState(false);

  // O(1) card lookup keyed on the aggregated cart id. Most ids follow the
  // historical `${setCode}-${collectorNumber}-${finish}-${condition}` shape,
  // but set codes can themselves contain hyphens (for example `pmei-2024`),
  // so reconciliation must never infer current-vs-legacy solely from
  // `id.split("-").length`.
  const cardMap = useMemo(
    () => new Map(cards.map((c) => [c.id, c])),
    [cards],
  );

  // v1.3 Phase 20 D-08 — extended cart reconciliation. Runs once after
  // hydration.
  //   STEP 0: snapshot cart entries (avoid iterator invalidation while we
  //           mutate the store mid-loop).
  //   STEP 1: check the exact aggregated cart key first. This is load-bearing
  //           for modern set codes containing hyphens, e.g.
  //           `pmei-2024-5-foil-near_mint`.
  //   STEP 2: if no exact card exists, strip only the final hyphen-delimited
  //           suffix as a possible legacy per-binder key.
  //   STEP 3: transfer-and-clamp the stale-key quantity into the
  //           aggregated entry (sums across multiple legacy keys for the
  //           same logical card; clamps to current aggregated stock).
  //   STEP 4: clamp already-aggregated keys to current stock (Pitfall 11
  //           mid-session stock-drop case).
  //   STEP 5: silently remove unmatchable entries (preserves Phase 10-03
  //           D-13 silent-drop behavior verbatim as the final fallback).
  //   STEP 6: fire one-time migration toast iff needsCartMigration was
  //           true at the start of the effect, then advance sentinel via
  //           markCartMigrated().
  useEffect(() => {
    if (!hydrated) return;
    const startState = useCartStore.getState();
    const shouldFireToast = needsCartMigration(startState);

    // STEP 0: snapshot
    const entries = [...startState.items.entries()];
    for (const [cartKey, qty] of entries) {
      // STEP 1 + STEP 4: exact current aggregated key path.
      const exactCard = cardMap.get(cartKey);
      if (exactCard) {
        if (qty > exactCard.quantity) {
          setQuantity(cartKey, exactCard.quantity);
        }
        continue;
      }

      // STEP 2: legacy per-binder keys were formed by appending
      // `-${binder}` to the aggregated id. Binder names are normalized with
      // hyphens converted to underscores, so stripping only the final hyphen
      // suffix preserves hyphenated set codes such as `pmei-2024`.
      const lastHyphen = cartKey.lastIndexOf("-");
      const candidate = lastHyphen > 0 ? cartKey.slice(0, lastHyphen) : "";
      const candidateCard = candidate ? cardMap.get(candidate) : undefined;
      if (candidateCard) {
        // STEP 3: transfer-and-clamp. Sum existing aggregated qty (if any)
        // with the stale-key qty, then setQuantity clamps to maxStock.
        const existing = useCartStore.getState().items.get(candidate) ?? 0;
        setQuantity(candidate, existing + qty, candidateCard.quantity);
        removeItem(cartKey);
      } else {
        // STEP 5: silently drop unmatchable stale entry
        removeItem(cartKey);
      }
    }

    if (shouldFireToast) {
      // STEP 6: fire one-time toast and advance sentinel.
      queueMicrotask(() => setShowMigrationToast(true));
      markCartMigrated();
    }
  }, [hydrated, items, cardMap, removeItem, setQuantity]);

  // Convert Map to array for rendering
  const cartEntries = useMemo(() => [...items.entries()], [items]);

  // Compute total price
  const totalPrice = useMemo(() => {
    let sum = 0;
    for (const [id, qty] of items) {
      const card = cardMap.get(id);
      if (card?.price) sum += card.price * qty;
    }
    return sum;
  }, [items, cardMap]);

  // Loading state before hydration. NOTE: the migration toast does NOT
  // render here because the reconciliation effect hasn't run yet — it
  // first becomes visible in the empty-state or items branches.
  if (!hydrated) {
    return (
      <div className="max-w-3xl mx-auto px-4">
        <div className="wiko-skeleton" style={{ height: 32, width: 128, marginTop: 8, marginBottom: 24 }} />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="wiko-skeleton" style={{ height: 80 }} />
          ))}
        </div>
      </div>
    );
  }

  // Empty cart state — the Satchel is empty. The migration toast still
  // renders here so the D-15 empty-cart-edge case (toast fires when a
  // pre-v1.3 buyer first visits with an empty cart) is covered.
  if (items.size === 0) {
    return (
      <>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "64px 24px", textAlign: "center" }}>
          <svg width="160" height="120" viewBox="0 0 140 110" aria-hidden style={{ marginBottom: 24 }}>
            <defs>
              <pattern id="stripe" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(135)">
                <rect width="3" height="6" fill="var(--surface-2)" />
                <rect x="3" width="3" height="6" fill="var(--surface)" />
              </pattern>
            </defs>
            <g transform="translate(18,28) rotate(-14)">
              <rect width="46" height="66" rx="3" fill="url(#stripe)" stroke="var(--border-strong)" strokeWidth="1" />
            </g>
            <g transform="translate(48,20)">
              <rect width="46" height="66" rx="3" fill="url(#stripe)" stroke="var(--border-strong)" strokeWidth="1" />
            </g>
            <g transform="translate(78,28) rotate(14)">
              <rect width="46" height="66" rx="3" fill="url(#stripe)" stroke="var(--border-strong)" strokeWidth="1" />
            </g>
            <g transform="translate(110,18)" opacity="0.5">
              <path d="M0 -5 L1.2 -1.2 L5 0 L1.2 1.2 L0 5 L-1.2 1.2 L-5 0 L-1.2 -1.2 Z" fill="var(--accent)" />
            </g>
          </svg>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 28,
              fontStyle: "italic",
              color: "var(--ink)",
              marginBottom: 8,
            }}
          >
            The satchel is empty.
          </div>
          <p
            style={{
              fontSize: 12,
              color: "var(--muted)",
              margin: "0 auto 24px",
              maxWidth: 280,
              lineHeight: 1.6,
              fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Choose a card — it will land here.
          </p>
          <Link
            href="/"
            style={{
              display: "inline-block",
              background: "var(--accent)",
              color: "var(--accent-fg)",
              padding: "10px 18px",
              borderRadius: 3,
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: "0.02em",
              textDecoration: "none",
              fontFamily: "inherit",
            }}
          >
            Browse cards
          </Link>
        </div>
        {showMigrationToast && (
          <CartMigrationToast
            onDismiss={() => setShowMigrationToast(false)}
          />
        )}
      </>
    );
  }

  // Cart with items
  return (
    <>
      <div
        className="wiko-cart-page"
        style={{ maxWidth: 780, margin: "0 auto", padding: "0 24px" }}
      >
        <div
          className="wiko-cart-heading"
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 20,
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: 32,
              fontWeight: 400,
              fontStyle: "italic",
            }}
          >
            The Satchel
          </h1>
          {confirmingClear ? (
            <div
              role="group"
              aria-label="Confirm emptying the satchel"
              style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: "var(--muted)",
                  fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Remove all cards?
              </span>
              <button
                type="button"
                onClick={() => {
                  clearCart();
                  setConfirmingClear(false);
                }}
                style={{
                  background: "none",
                  border: "1px solid var(--bad)",
                  borderRadius: 3,
                  color: "var(--bad-soft)",
                  padding: "5px 10px",
                  fontSize: 11,
                  cursor: "pointer",
                  fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Empty it
              </button>
              <button
                type="button"
                onClick={() => setConfirmingClear(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--muted)",
                  fontSize: 11,
                  cursor: "pointer",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                  fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Keep them
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingClear(true)}
              style={{
                background: "none",
                border: "none",
                color: "var(--muted)",
                fontSize: 12,
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: 3,
                fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Empty the satchel
            </button>
          )}
        </div>

        <div className="wiko-cart-list space-y-3">
          {cartEntries.map(([cardId, qty]) => (
            <CartItem
              key={cardId}
              cardId={cardId}
              quantity={qty}
              card={cardMap.get(cardId)}
              maxStock={cardMap.get(cardId)?.quantity ?? 0}
              onQuantityChange={(newQty) =>
                setQuantity(cardId, newQty, cardMap.get(cardId)?.quantity)
              }
              onRemove={() => removeItem(cardId)}
            />
          ))}
        </div>

        <CartSummaryBar totalItems={totalItems} totalPrice={totalPrice} />
      </div>
      {showMigrationToast && (
        <CartMigrationToast onDismiss={() => setShowMigrationToast(false)} />
      )}
    </>
  );
}
