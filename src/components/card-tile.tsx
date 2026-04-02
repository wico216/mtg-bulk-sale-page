import Image from "next/image";
import type { Card } from "@/lib/types";

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
    </button>
  );
}
