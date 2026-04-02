"use client";

import Link from "next/link";

interface CartSummaryBarProps {
  totalItems: number;
  totalPrice: number;
}

export default function CartSummaryBar({
  totalItems,
  totalPrice,
}: CartSummaryBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3">
      <div className="max-w-3xl mx-auto flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">
            {totalItems} {totalItems === 1 ? "card" : "cards"} &mdash; $
            {totalPrice.toFixed(2)}
          </p>
        </div>
        <Link
          href="/checkout"
          className="px-5 py-2 text-sm font-medium rounded-md bg-accent text-white hover:bg-accent-hover transition-colors"
        >
          Checkout
        </Link>
      </div>
    </div>
  );
}
