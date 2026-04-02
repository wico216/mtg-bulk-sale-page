"use client";

import Image from "next/image";
import type { Card } from "@/lib/types";
import { useCartStore } from "@/lib/store/cart-store";

const CONDITION_MAP: Record<string, string> = {
  near_mint: "NM",
  lightly_played: "LP",
  moderately_played: "MP",
  heavily_played: "HP",
  damaged: "DMG",
};

function formatCondition(condition: string): string {
  return CONDITION_MAP[condition] ?? condition;
}

function formatPrice(price: number | null): string {
  if (price === null) return "N/A";
  return `$${price.toFixed(2)}`;
}

interface CardTileProps {
  card: Card;
  onClick: () => void;
}

export default function CardTile({ card, onClick }: CardTileProps) {
  const inCart = useCartStore((s) => s.hasItem(card.id));
  const qty = useCartStore((s) => s.getQuantity(card.id));
  const addItem = useCartStore((s) => s.addItem);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left w-full cursor-pointer"
    >
      {/* Image */}
      <div className="relative aspect-[5/7] w-full overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
        {card.imageUrl ? (
          <Image
            src={card.imageUrl}
            alt={card.name}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1024px) 25vw, 20vw"
            className="object-cover group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-400 text-sm">
            No Image
          </div>
        )}
        {card.foil && (
          <span className="absolute top-1.5 right-1.5 bg-amber-100 text-amber-700 text-xs font-medium rounded px-1.5 py-0.5">
            FOIL
          </span>
        )}
      </div>

      {/* Metadata */}
      <div className="mt-1.5 space-y-0.5">
        <p className="text-sm font-medium leading-tight truncate">
          {card.name}
        </p>
        <p className="text-xs text-zinc-400 truncate">{card.setName}</p>
        <p className="text-sm text-zinc-500">{formatPrice(card.price)}</p>
        <p className="text-xs text-zinc-400">
          {formatCondition(card.condition)} x{card.quantity}
        </p>
      </div>

      {/* Cart controls */}
      {!inCart ? (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            addItem(card.id, card.quantity);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              addItem(card.id, card.quantity);
            }
          }}
          className="mt-2 w-full py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:bg-accent-hover transition-colors block text-center"
        >
          Add to cart
        </span>
      ) : (
        <div
          className="mt-2 flex items-center justify-center gap-3"
          onClick={(e) => e.stopPropagation()}
        >
          <span
            role="button"
            tabIndex={0}
            onClick={() =>
              qty <= 1
                ? removeItem(card.id)
                : setQuantity(card.id, qty - 1, card.quantity)
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                qty <= 1
                  ? removeItem(card.id)
                  : setQuantity(card.id, qty - 1, card.quantity);
              }
            }}
            className="w-7 h-7 flex items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-600 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            -
          </span>
          <span className="text-sm font-medium min-w-[2ch] text-center">
            {qty}
          </span>
          <span
            role="button"
            tabIndex={0}
            onClick={() => setQuantity(card.id, qty + 1, card.quantity)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                setQuantity(card.id, qty + 1, card.quantity);
              }
            }}
            aria-disabled={qty >= card.quantity}
            className={`w-7 h-7 flex items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-600 text-sm font-medium transition-colors ${
              qty >= card.quantity
                ? "opacity-30 cursor-not-allowed"
                : "hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
            }`}
          >
            +
          </span>
        </div>
      )}
    </button>
  );
}
