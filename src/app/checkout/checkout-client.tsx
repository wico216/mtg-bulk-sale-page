"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Card } from "@/lib/types";
import { useCartStore } from "@/lib/store/cart-store";
import OrderSummary from "@/components/order-summary";
import type { OrderSummaryItem } from "@/components/order-summary";

interface CheckoutClientProps {
  cards: Card[];
}

export default function CheckoutClient({ cards }: CheckoutClientProps) {
  const router = useRouter();

  // Cart state from Zustand
  const items = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clearCart);
  const totalItems = useCartStore((s) => s.totalItems());

  // Hydration guard
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const unsub = useCartStore.persist.onFinishHydration(() =>
      setHydrated(true),
    );
    if (useCartStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Computed values
  const cardMap = useMemo(
    () => new Map(cards.map((c) => [c.id, c])),
    [cards],
  );

  const cartEntries = useMemo(() => [...items.entries()], [items]);

  const totalPrice = useMemo(() => {
    let sum = 0;
    for (const [id, qty] of items) {
      const card = cardMap.get(id);
      if (card?.price) sum += card.price * qty;
    }
    return sum;
  }, [items, cardMap]);

  const orderSummaryItems: OrderSummaryItem[] = useMemo(
    () =>
      cartEntries.map(([cardId, qty]) => {
        const card = cardMap.get(cardId);
        return {
          name: card?.name ?? cardId,
          setName: card?.setName ?? "",
          imageUrl: card?.imageUrl ?? null,
          price: card?.price ?? null,
          quantity: qty,
        };
      }),
    [cartEntries, cardMap],
  );

  // Submit handler (D-19, D-20, D-21, D-23)
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerName: name.trim(),
          buyerEmail: email.trim(),
          message: message.trim() || undefined,
          items: cartEntries.map(([cardId, qty]) => ({
            cardId,
            quantity: qty,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok)
        throw new Error(
          data.error || "Something went wrong. Your order was not placed.",
        );

      // D-20: Stash full order in sessionStorage BEFORE clearing cart (Pitfall 4)
      sessionStorage.setItem("lastOrder", JSON.stringify(data.order));
      // D-21: Clear cart
      clearCart();
      // D-20: Navigate to confirmation with essential fields in URL
      router.push(
        `/confirmation?ref=${data.orderRef}&email=${encodeURIComponent(email.trim())}&total=${totalPrice.toFixed(2)}&count=${totalItems}&name=${encodeURIComponent(name.trim())}`,
      );
    } catch (err) {
      // D-23: Show error, preserve form data and cart
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Your order was not placed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  // Loading state before hydration
  if (!hydrated) {
    return (
      <div className="max-w-3xl mx-auto px-4">
        <div className="h-8 w-32 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse mt-2 mb-6" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-10 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse"
            />
          ))}
        </div>
        <div className="space-y-3 mt-6">
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

  // Empty cart guard (D-07)
  if (items.size === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 text-center py-16">
        <p className="text-lg text-zinc-500 mb-4">Your cart is empty</p>
        <p className="text-sm text-zinc-400 mb-6">
          Add some cards before checking out.
        </p>
        <Link
          href="/"
          className="inline-block px-5 py-2 text-sm font-medium rounded-md bg-accent text-white hover:bg-accent-hover transition-colors"
        >
          Browse cards
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-3xl mx-auto px-4 pt-6 pb-32">
        {/* Page heading */}
        <h1 className="text-xl font-semibold mb-6">Checkout</h1>

        <div className="flex flex-col md:grid md:grid-cols-3 md:gap-8">
          {/* Form renders first in mobile column flow (per D-05) */}
          <div className="md:col-span-2">
            <h2 className="text-sm font-semibold text-zinc-500 mb-4">
              Your details
            </h2>
            <form
              id="checkout-form"
              onSubmit={handleSubmit}
              aria-busy={submitting}
            >
              <div className="space-y-4">
                {/* Name field */}
                <div>
                  <label
                    htmlFor="name"
                    className="text-sm font-semibold mb-1 block"
                  >
                    Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    required
                    aria-required="true"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={submitting}
                    className="w-full border border-zinc-300 dark:border-zinc-600 rounded-md px-3 py-2 bg-transparent text-sm outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Email field */}
                <div>
                  <label
                    htmlFor="email"
                    className="text-sm font-semibold mb-1 block"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    aria-required="true"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={submitting}
                    className="w-full border border-zinc-300 dark:border-zinc-600 rounded-md px-3 py-2 bg-transparent text-sm outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Message field */}
                <div>
                  <label
                    htmlFor="message"
                    className="text-sm font-semibold mb-1 block"
                  >
                    Message (optional)
                  </label>
                  <textarea
                    id="message"
                    rows={3}
                    placeholder="Any notes for the seller, e.g. pickup time"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={submitting}
                    className="w-full border border-zinc-300 dark:border-zinc-600 rounded-md px-3 py-2 bg-transparent text-sm outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Error display */}
              {error !== null && (
                <div
                  role="alert"
                  className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md p-3 text-sm text-red-600 dark:text-red-400 mt-4"
                >
                  <p>{error}</p>
                  <button
                    type="submit"
                    className="mt-2 px-5 py-2 text-sm font-semibold rounded-md bg-accent text-white hover:bg-accent-hover transition-colors"
                  >
                    Try again
                  </button>
                </div>
              )}

              {/* Desktop-only submit button */}
              <button
                type="submit"
                disabled={submitting || items.size === 0}
                className={`hidden md:block w-full mt-6 px-5 py-3 text-sm font-semibold rounded-md transition-colors ${
                  submitting
                    ? "bg-accent text-white opacity-70 cursor-not-allowed"
                    : items.size === 0
                      ? "opacity-30 cursor-not-allowed bg-zinc-300 text-zinc-500"
                      : "bg-accent text-white hover:bg-accent-hover"
                }`}
              >
                {submitting ? "Placing order..." : "Place order"}
              </button>
            </form>
          </div>

          {/* Order summary renders second in mobile, right sidebar on desktop */}
          <div className="mt-8 md:mt-0 md:order-2 md:sticky md:top-6 md:self-start">
            <OrderSummary
              items={orderSummaryItems}
              totalPrice={totalPrice}
              totalItems={totalItems}
              editCartLink={true}
            />
          </div>
        </div>
      </div>

      {/* Sticky mobile submit bar (D-06) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 md:hidden">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <p className="text-sm font-medium">
            {totalItems} {totalItems === 1 ? "card" : "cards"} &mdash; $
            {totalPrice.toFixed(2)}
          </p>
          <button
            type="submit"
            form="checkout-form"
            disabled={submitting || items.size === 0}
            className="px-5 py-2 text-sm font-semibold rounded-md bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {submitting ? "Placing order..." : "Place order"}
          </button>
        </div>
      </div>
    </>
  );
}
