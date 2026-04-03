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

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const MANA_SYMBOL_RE = /\{([^}]+)\}/g;

function ManaSymbol({ symbol }: { symbol: string }) {
  const code = symbol.replace("/", "");
  return (
    <img
      src={`https://svgs.scryfall.io/card-symbols/${encodeURIComponent(code)}.svg`}
      alt={`{${symbol}}`}
      className="inline-block w-4 h-4 align-text-bottom mx-0.5"
    />
  );
}

function OracleText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MANA_SYMBOL_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(<ManaSymbol key={match.index} symbol={match[1]} />);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return <>{parts}</>;
}

interface CardModalProps {
  card: Card;
  onClose: () => void;
  onImageClick: () => void;
}

export default function CardModal({ card, onClose, onImageClick }: CardModalProps) {
  const inCart = useCartStore((s) => s.hasItem(card.id));
  const qty = useCartStore((s) => s.getQuantity(card.id));
  const addItem = useCartStore((s) => s.addItem);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 md:p-8"
      onClick={onClose}
    >
      <div
        className="relative max-h-full w-full max-w-5xl overflow-y-auto rounded-xl bg-white p-8 max-md:fixed max-md:inset-0 max-md:rounded-none max-md:max-w-none max-md:overflow-y-auto max-md:p-6 md:flex md:gap-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 text-zinc-400 hover:text-zinc-600 text-xl leading-none cursor-pointer"
          aria-label="Close"
        >
          &#x2715;
        </button>

        {/* Image section */}
        <div className="w-full max-w-xs mx-auto md:w-96 md:flex-shrink-0 mb-4 md:mb-0">
          <button
            type="button"
            onClick={card.imageUrl ? onImageClick : undefined}
            className={`relative aspect-[5/7] w-full overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800 ${card.imageUrl ? "cursor-zoom-in" : ""}`}
            aria-label="View full image"
          >
            {card.imageUrl ? (
              <Image
                src={card.imageUrl}
                alt={card.name}
                fill
                sizes="(max-width: 768px) 80vw, 384px"
                className="object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-zinc-400 text-base">
                No Image
              </div>
            )}
          </button>
        </div>

        {/* Text section */}
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold mb-2 text-zinc-900">{card.name}</h2>

          <p className="text-sm text-zinc-500 mb-3">
            {card.setName} &mdash; {capitalizeFirst(card.rarity)}
          </p>

          {card.foil && (
            <span className="inline-block bg-amber-100 text-amber-700 text-xs font-medium rounded px-2 py-0.5 mb-3">
              FOIL
            </span>
          )}

          <p className="text-lg font-semibold text-zinc-900 mb-3">
            {formatPrice(card.price)}
          </p>

          <p className="text-sm text-zinc-600 mb-1">
            {formatCondition(card.condition)} &mdash; Qty: {card.quantity}
          </p>

          {/* Cart controls */}
          {!inCart ? (
            <button
              type="button"
              onClick={() => addItem(card.id, card.quantity)}
              className="mt-3 px-5 py-2 text-sm font-medium rounded-md bg-accent text-white hover:bg-accent-hover transition-colors cursor-pointer"
            >
              Add to cart
            </button>
          ) : (
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  qty <= 1
                    ? removeItem(card.id)
                    : setQuantity(card.id, qty - 1, card.quantity)
                }
                className="w-8 h-8 flex items-center justify-center rounded-full border-2 !border-black dark:!border-white text-sm font-bold !text-black dark:!text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                -
              </button>
              <span className="text-base font-bold min-w-[2ch] text-center !text-black dark:!text-white">
                {qty}
              </span>
              <button
                type="button"
                onClick={() => setQuantity(card.id, qty + 1, card.quantity)}
                disabled={qty >= card.quantity}
                className="w-8 h-8 flex items-center justify-center rounded-full border-2 !border-black dark:!border-white text-sm font-bold !text-black dark:!text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                +
              </button>
              <span className="text-sm !text-black dark:!text-white font-semibold ml-2">in cart</span>
            </div>
          )}

          {card.oracleText ? (
            <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-line mt-4 pt-4 border-t border-zinc-100">
              <OracleText text={card.oracleText} />
            </p>
          ) : (
            <p className="text-sm text-zinc-400 italic mt-4 pt-4 border-t border-zinc-100">
              No oracle text available
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
