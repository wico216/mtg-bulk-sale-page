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

  // O(1) card lookup keyed on the AGGREGATED 4-segment id (the buyer's
  // cart key shape after Plan 20-01).
  const cardMap = useMemo(
    () => new Map(cards.map((c) => [c.id, c])),
    [cards],
  );

  // v1.3 Phase 20 D-08 — extended cart reconciliation. Runs once after
  // hydration.
  //   STEP 0: snapshot cart entries (avoid iterator invalidation while we
  //           mutate the store mid-loop).
  //   STEP 1: segment-strip 5-segment legacy v1.2 keys to their 4-segment
  //           aggregated candidate.
  //   STEP 2: transfer-and-clamp the stale-key quantity into the
  //           aggregated entry (sums across multiple legacy keys for the
  //           same logical card; clamps to current aggregated stock).
  //   STEP 3: clamp already-aggregated keys to current stock (Pitfall 11
  //           mid-session stock-drop case).
  //   STEP 4: silently remove unmatchable entries (preserves Phase 10-03
  //           D-13 silent-drop behavior verbatim as the final fallback).
  //   STEP 5: fire one-time migration toast iff needsCartMigration was
  //           true at the start of the effect, then advance sentinel via
  //           markCartMigrated().
  useEffect(() => {
    if (!hydrated) return;
    const startState = useCartStore.getState();
    const shouldFireToast = needsCartMigration(startState);

    // STEP 0: snapshot
    const entries = [...startState.items.entries()];
    for (const [cartKey, qty] of entries) {
      const segs = cartKey.split("-");
      if (segs.length === 5) {
        // STEP 1: segment-strip
        const candidate = segs.slice(0, 4).join("-");
        const candidateCard = cardMap.get(candidate);
        if (candidateCard) {
          // STEP 2: transfer-and-clamp. Sum existing aggregated qty (if any)
          // with the stale-key qty, then setQuantity clamps to maxStock.
          const existing = useCartStore.getState().items.get(candidate) ?? 0;
          setQuantity(candidate, existing + qty, candidateCard.quantity);
          removeItem(cartKey);
        } else {
          // STEP 4: silently drop unmatchable legacy entry
          removeItem(cartKey);
        }
        continue;
      }
      // 4-segment key path: check existence + clamp current.
      const card = cardMap.get(cartKey);
      if (!card) {
        // STEP 4: silent drop preserved from Phase 10-03 D-13
        removeItem(cartKey);
        continue;
      }
      // STEP 3: clamp on already-aggregated key (Pitfall 11)
      if (qty > card.quantity) {
        setQuantity(cartKey, card.quantity);
      }
    }

    if (shouldFireToast) {
      // STEP 5: fire one-time toast and advance sentinel.
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

  function handleClearCart() {
    if (window.confirm("Are you sure you want to clear your cart?")) {
      clearCart();
    }
  }

  // Loading state before hydration. NOTE: the migration toast does NOT
  // render here because the reconciliation effect hasn't run yet — it
  // first becomes visible in the empty-state or items branches.
  if (!hydrated) {
    return (
      <div className="max-w-3xl mx-auto px-4">
        <div className="h-8 w-32 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse mt-2 mb-6" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 bg-zinc-50 dark:bg-zinc-900 rounded-lg animate-pulse"
            />
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
          <button
            type="button"
            onClick={handleClearCart}
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
