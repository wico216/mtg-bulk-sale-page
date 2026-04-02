"use client";

import { useState, useEffect } from "react";
import type { Card, CardData } from "@/lib/types";
import CardTile from "@/components/card-tile";
import CardModal from "@/components/card-modal";

interface CardGridProps {
  cards: Card[];
  meta: CardData["meta"];
}

export default function CardGrid({ cards, meta }: CardGridProps) {
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  useEffect(() => {
    if (selectedCard) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedCard]);

  if (cards.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 pb-8">
        <p className="text-center text-zinc-500 py-16">
          No cards available. Run{" "}
          <code className="bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded text-sm">
            npm run generate
          </code>{" "}
          to build inventory.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 pb-8">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
        {cards.map((card) => (
          <CardTile
            key={card.id}
            card={card}
            onClick={() => setSelectedCard(card)}
          />
        ))}
      </div>
      {selectedCard && (
        <CardModal
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
        />
      )}
    </div>
  );
}
