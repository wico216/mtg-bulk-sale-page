"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import type { Card } from "@/lib/types";
import { useCartStore } from "@/lib/store/cart-store";
import CartItem from "@/components/cart-item";
import CartSummaryBar from "@/components/cart-summary-bar";

interface CartPageClientProps {
  cards: Card[];
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
    const unsub = useCartStore.persist.onFinishHydration(() =>
      setHydrated(true),
    );
    if (useCartStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);

  // O(1) card lookup
  const cardMap = useMemo(
    () => new Map(cards.map((c) => [c.id, c])),
    [cards],
  );

  // D-13: After import, the cards DB may have different IDs than what's in the
  // buyer's localStorage cart. Silently drop any stale IDs — no visible "No longer
  // available" warning. The buyer's cart just quietly shrinks to what still exists.
  useEffect(() => {
    if (!hydrated) return;
    for (const [cardId] of items) {
      if (!cardMap.has(cardId)) {
        removeItem(cardId);
      }
    }
  }, [hydrated, items, cardMap, removeItem]);

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

  // Loading state before hydration
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

  // Empty cart state — the Satchel is empty.
  if (items.size === 0) {
    return (
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
    );
  }

  // Cart with items
  return (
    <div style={{ maxWidth: 780, margin: "0 auto", padding: "0 24px" }}>
      <div
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

      <div className="space-y-3">
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
  );
}
