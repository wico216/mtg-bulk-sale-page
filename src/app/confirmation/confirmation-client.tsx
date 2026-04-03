"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { OrderData } from "@/lib/types";
import OrderSummary from "@/components/order-summary";
import type { OrderSummaryItem } from "@/components/order-summary";

export default function ConfirmationClient() {
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref");
  const emailParam = searchParams.get("email");
  const totalParam = searchParams.get("total");
  const countParam = searchParams.get("count");
  const buyerName = searchParams.get("name");

  // Try sessionStorage for full order (may be empty on refresh/new tab)
  const [fullOrder, setFullOrder] = useState<OrderData | null>(null);
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("lastOrder");
      if (stored) setFullOrder(JSON.parse(stored));
    } catch {
      /* ignore parse errors */
    }
  }, []);

  // No order data guard (D-22)
  if (!ref) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-lg text-zinc-500 mb-4">No order found</p>
        <Link
          href="/"
          className="inline-block px-5 py-2.5 text-sm font-semibold rounded-md bg-accent text-white hover:bg-accent-hover transition-colors"
        >
          Browse cards
        </Link>
      </div>
    );
  }

  // Use fullOrder data if available, otherwise fall back to URL params
  const displayCount = fullOrder
    ? fullOrder.totalItems
    : countParam
      ? parseInt(countParam, 10)
      : 0;
  const displayTotal = fullOrder
    ? fullOrder.totalPrice
    : totalParam
      ? parseFloat(totalParam)
      : 0;
  const displayEmail = fullOrder ? fullOrder.buyerEmail : emailParam ?? "";

  // Convert fullOrder items to OrderSummaryItem format
  const orderSummaryItems: OrderSummaryItem[] = fullOrder
    ? fullOrder.items.map((item) => ({
        name: item.name,
        setName: item.setName,
        imageUrl: null, // OrderData items don't carry imageUrl
        price: item.price,
        quantity: item.quantity,
      }))
    : [];

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      {/* Checkmark icon */}
      <div className="w-16 h-16 rounded-full bg-accent-light flex items-center justify-center mx-auto mb-6">
        <svg
          className="w-8 h-8 text-accent"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 12.75l6 6 9-13.5"
          />
        </svg>
      </div>

      {/* Success heading */}
      <h1 className="text-2xl font-semibold mb-2">Order placed!</h1>

      {/* Summary line */}
      <p className="text-xl text-zinc-500 mb-1">
        {displayCount} {displayCount === 1 ? "card" : "cards"} &mdash; $
        {displayTotal.toFixed(2)}
      </p>

      {/* Order ref */}
      <p className="text-sm text-zinc-400 mb-6">Order {ref}</p>

      {/* Email note */}
      <p className="text-sm text-zinc-400 mb-6">
        Confirmation sent to {displayEmail}
      </p>

      {/* Full order list from sessionStorage */}
      {fullOrder && fullOrder.items.length > 0 && (
        <div className="text-left mb-8">
          <OrderSummary
            items={orderSummaryItems}
            totalPrice={displayTotal}
            totalItems={displayCount}
            editCartLink={false}
          />
        </div>
      )}

      {/* Pay-in-person note (D-26) */}
      <p className="text-sm text-zinc-500 mt-6">
        No payment needed now &mdash; just pay when you pick up.
      </p>

      {/* Browse more cards link (D-27) */}
      <Link
        href="/"
        className="inline-block mt-8 px-5 py-2.5 text-sm font-semibold rounded-md bg-accent text-white hover:bg-accent-hover transition-colors"
      >
        Browse more cards
      </Link>
    </div>
  );
}
