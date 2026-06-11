"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CheckoutResponse, PublicCard, StockConflict } from "@/lib/types";
import { useCartStore } from "@/lib/store/cart-store";
import OrderSummary from "@/components/order-summary";
import type { OrderSummaryItem } from "@/components/order-summary";

interface CheckoutClientProps {
  cards: PublicCard[];
}

interface CheckoutErrorResponse {
  error?: string;
  code?: string;
  conflicts?: StockConflict[];
}

function formatCheckoutError(data: CheckoutErrorResponse): string {
  if (data.code === "stock_conflict" && data.conflicts?.length) {
    const details = data.conflicts
      .map(
        (conflict) =>
          `${conflict.name} requested ${conflict.requested}, available ${conflict.available}`,
      )
      .join("; ");
    return `Some cards are no longer available: ${details}.`;
  }

  return data.error || "Something went wrong. Your order was not placed.";
}

const fieldLabelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontSize: 13,
  fontWeight: 600,
  color: "var(--ink)",
};

const submitButtonStyle: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--accent-fg)",
  border: "none",
  borderRadius: 3,
  fontWeight: 600,
  letterSpacing: "0.02em",
  fontFamily: "inherit",
  cursor: "pointer",
};

const reassuranceStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--muted)",
  fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

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
  const [phone, setPhone] = useState("");
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
          buyerPhone: phone.trim() || undefined,
          message: message.trim() || undefined,
          items: cartEntries.map(([cardId, qty]) => ({
            cardId,
            quantity: qty,
          })),
        }),
      });

      const data = (await res.json()) as CheckoutErrorResponse &
        Partial<CheckoutResponse>;
      if (!res.ok) throw new Error(formatCheckoutError(data));

      // D-20: Stash confirmation payload BEFORE clearing cart (Pitfall 4)
      sessionStorage.setItem(
        "lastOrder",
        JSON.stringify({
          order: data.order,
          notification: data.notification,
        }),
      );
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
        <div className="wiko-skeleton" style={{ height: 32, width: 128, marginTop: 8, marginBottom: 24 }} />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="wiko-skeleton" style={{ height: 40 }} />
          ))}
        </div>
        <div className="space-y-3 mt-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="wiko-skeleton" style={{ height: 80 }} />
          ))}
        </div>
      </div>
    );
  }

  // Empty cart guard (D-07)
  if (items.size === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 text-center py-16">
        <p
          style={{
            margin: "0 0 8px",
            fontFamily: "var(--font-display)",
            fontSize: 24,
            fontStyle: "italic",
            color: "var(--ink)",
          }}
        >
          Your cart is empty
        </p>
        <p style={{ margin: "0 0 24px", fontSize: 13, color: "var(--muted)" }}>
          Add some cards before checking out.
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
          }}
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
        <h1
          style={{
            margin: "0 0 24px",
            fontFamily: "var(--font-display)",
            fontSize: 32,
            fontWeight: 400,
            fontStyle: "italic",
            letterSpacing: "-0.005em",
          }}
        >
          Checkout
        </h1>

        <div className="flex flex-col md:grid md:grid-cols-3 md:gap-8">
          {/* Order summary on top always */}
          <div className="md:col-span-3">
            <OrderSummary
              items={orderSummaryItems}
              totalPrice={totalPrice}
              totalItems={totalItems}
              editCartLink={true}
            />
          </div>

          {/* Form below summary */}
          <div className="mt-8 md:col-span-3">
            <h2 className="wiko-eyebrow" style={{ marginBottom: 14 }}>
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
                  <label htmlFor="name" style={fieldLabelStyle}>
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
                    className="wiko-input"
                  />
                </div>

                {/* Email field */}
                <div>
                  <label htmlFor="email" style={fieldLabelStyle}>
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
                    className="wiko-input"
                  />
                </div>

                {/* Phone field (optional) — Quick 260514-7z2 */}
                <div>
                  <label htmlFor="buyerPhone" style={fieldLabelStyle}>
                    Phone (optional)
                  </label>
                  <input
                    id="buyerPhone"
                    name="buyerPhone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={32}
                    placeholder="555-1234"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={submitting}
                    className="wiko-input"
                  />
                  <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--muted)" }}>
                    For shipping coordination. Optional.
                  </p>
                </div>

                {/* Message field */}
                <div>
                  <label htmlFor="message" style={fieldLabelStyle}>
                    Message (optional)
                  </label>
                  <textarea
                    id="message"
                    rows={3}
                    placeholder="Any notes for the seller, e.g. pickup time"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={submitting}
                    className="wiko-input"
                    style={{ resize: "vertical" }}
                  />
                </div>
              </div>

              {/* Error display */}
              {error !== null && (
                <div
                  role="alert"
                  style={{
                    marginTop: 16,
                    border: "1px solid var(--bad)",
                    background: "color-mix(in oklch, var(--bad) 12%, var(--bg))",
                    borderRadius: 6,
                    padding: "12px 14px",
                    fontSize: 13,
                    color: "var(--ink)",
                  }}
                >
                  <p style={{ margin: 0 }}>{error}</p>
                  <button
                    type="submit"
                    style={{
                      ...submitButtonStyle,
                      marginTop: 10,
                      padding: "10px 18px",
                      fontSize: 13,
                    }}
                  >
                    Try again
                  </button>
                </div>
              )}

              {/* Pay-in-person reassurance + desktop-only submit button */}
              <p
                className="hidden md:block"
                style={{
                  ...reassuranceStyle,
                  margin: "20px 0 10px",
                  textAlign: "center",
                }}
              >
                No payment needed now — pay at pickup.
              </p>
              <button
                type="submit"
                disabled={submitting || items.size === 0}
                className="hidden md:block w-full"
                style={{
                  ...submitButtonStyle,
                  padding: "14px 22px",
                  fontSize: 14,
                  opacity: submitting ? 0.7 : items.size === 0 ? 0.45 : 1,
                  cursor:
                    submitting || items.size === 0 ? "not-allowed" : "pointer",
                }}
              >
                {submitting ? "Placing order..." : "Place order"}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Sticky mobile submit bar (D-06) */}
      <div
        className="md:hidden"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          borderTop: "1px solid var(--border)",
          background: "var(--surface)",
          padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
        }}
      >
        <div
          className="max-w-3xl mx-auto"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 500,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {totalItems} {totalItems === 1 ? "card" : "cards"} &mdash; $
              {totalPrice.toFixed(2)}
            </p>
            <p style={{ ...reassuranceStyle, margin: "3px 0 0", fontSize: 10 }}>
              No payment now — pay at pickup.
            </p>
          </div>
          <button
            type="submit"
            form="checkout-form"
            disabled={submitting || items.size === 0}
            style={{
              ...submitButtonStyle,
              flexShrink: 0,
              minHeight: 44,
              padding: "12px 18px",
              fontSize: 13,
              opacity: submitting || items.size === 0 ? 0.7 : 1,
              cursor:
                submitting || items.size === 0 ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "Placing order..." : "Place order"}
          </button>
        </div>
      </div>
    </>
  );
}
