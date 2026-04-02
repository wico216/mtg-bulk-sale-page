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

  // Empty cart state
  if (items.size === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 text-center py-16">
        <p className="text-lg text-zinc-500 mb-4">Your cart is empty</p>
        <Link
          href="/"
          className="inline-block px-5 py-2 text-sm font-medium rounded-md bg-accent text-white hover:bg-accent-hover transition-colors"
        >
          Browse cards
        </Link>
      </div>
    );
  }

  // Cart with items
  return (
    <div className="max-w-3xl mx-auto px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Your Cart</h1>
        <button
          onClick={handleClearCart}
          className="text-sm text-zinc-400 hover:text-red-500 transition-colors"
        >
          Clear cart
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
