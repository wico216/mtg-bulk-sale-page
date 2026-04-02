"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import type { Card } from "@/lib/types";

interface CartItemProps {
  cardId: string;
  quantity: number;
  card: Card | undefined;
  onQuantityChange: (qty: number) => void;
  onRemove: () => void;
  maxStock: number;
}

export default function CartItem({
  cardId,
  quantity,
  card,
  onQuantityChange,
  onRemove,
  maxStock,
}: CartItemProps) {
  const [stockWarning, setStockWarning] = useState(false);
  const warningTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showStockWarning() {
    setStockWarning(true);
    if (warningTimeout.current) clearTimeout(warningTimeout.current);
    warningTimeout.current = setTimeout(() => setStockWarning(false), 2000);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const parsed = parseInt(e.target.value, 10);
    if (isNaN(parsed) || parsed <= 0) {
      onRemove();
    } else if (parsed > maxStock) {
      onQuantityChange(maxStock);
      showStockWarning();
    } else {
      onQuantityChange(parsed);
    }
  }

  // Stale cart item: card no longer in inventory
  if (!card) {
    return (
      <div className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
        <div className="w-12 h-[67px] rounded bg-zinc-200 dark:bg-zinc-700 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-400 truncate">{cardId}</p>
          <p className="text-xs text-red-500">No longer available</p>
        </div>
        <button
          onClick={onRemove}
          className="p-1.5 text-zinc-400 hover:text-red-500 transition-colors"
          aria-label="Remove unavailable item"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-5 h-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18 18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
      {/* Thumbnail */}
      <div className="w-12 h-[67px] flex-shrink-0 relative">
        {card.imageUrl ? (
          <Image
            src={card.imageUrl}
            alt={card.name}
            width={48}
            height={67}
            className="rounded object-cover"
          />
        ) : (
          <div className="w-full h-full rounded bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-zinc-400 text-[8px]">
            No img
          </div>
        )}
      </div>

      {/* Card info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{card.name}</p>
        <p className="text-xs text-zinc-400 truncate">{card.setName}</p>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          {card.price !== null ? `$${card.price.toFixed(2)}` : "N/A"}
        </p>
      </div>

      {/* Quantity controls */}
      <div className="flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() =>
              quantity <= 1 ? onRemove() : onQuantityChange(quantity - 1)
            }
            className="w-7 h-7 flex items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-600 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Decrease quantity"
          >
            -
          </button>
          <input
            type="number"
            value={quantity}
            min={1}
            max={maxStock}
            onChange={handleInputChange}
            className="w-12 text-center text-sm border border-zinc-300 dark:border-zinc-600 rounded-md py-1 bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            aria-label="Quantity"
          />
          <button
            onClick={() => {
              if (quantity >= maxStock) {
                showStockWarning();
              } else {
                onQuantityChange(quantity + 1);
              }
            }}
            disabled={quantity >= maxStock}
            className={`w-7 h-7 flex items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-600 text-sm font-medium transition-colors ${
              quantity >= maxStock
                ? "opacity-30 cursor-not-allowed"
                : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
        {stockWarning && (
          <p className="text-xs text-amber-600 mt-0.5 text-center">
            Only {maxStock} available
          </p>
        )}
      </div>

      {/* Remove button */}
      <button
        onClick={onRemove}
        className="p-1.5 text-zinc-400 hover:text-red-500 transition-colors flex-shrink-0"
        aria-label="Remove from cart"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-5 h-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18 18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}
