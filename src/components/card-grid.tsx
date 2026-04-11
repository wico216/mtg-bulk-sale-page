"use client";

import { useState, useEffect, useMemo } from "react";
import type { Card, CardData } from "@/lib/types";
import { useFilterStore } from "@/lib/store/filter-store";
import CardTile from "@/components/card-tile";
import CardModal from "@/components/card-modal";

interface CardGridProps {
  cards: Card[];
  meta: CardData["meta"];
}

export default function CardGrid({ cards, meta }: CardGridProps) {
  const setAllCards = useFilterStore((s) => s.setAllCards);
  const clearFilters = useFilterStore((s) => s.clearFilters);
  const getFilteredCards = useFilterStore((s) => s.getFilteredCards);
  const allCards = useFilterStore((s) => s.allCards);
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const selectedColors = useFilterStore((s) => s.selectedColors);
  const selectedSets = useFilterStore((s) => s.selectedSets);
  const selectedRarities = useFilterStore((s) => s.selectedRarities);
  const sortBy = useFilterStore((s) => s.sortBy);

  const filteredCards = useMemo(
    () => getFilteredCards(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allCards, searchQuery, selectedColors, selectedSets, selectedRarities, sortBy],
  );

  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    setAllCards(cards);
  }, [cards, setAllCards]);

  useEffect(() => {
    if (selectedCard || lightboxUrl) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedCard, lightboxUrl]);

  if (cards.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 pb-8">
        <p className="text-center text-zinc-500 py-16">
          No cards available yet.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 pb-8">
      {filteredCards.length === 0 && cards.length > 0 ? (
        <div className="text-center py-16">
          <p className="text-zinc-500 mb-3">No cards match your filters</p>
          <button
            onClick={clearFilters}
            className="text-sm text-accent hover:text-accent-hover cursor-pointer"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
          {filteredCards.map((card) => (
            <CardTile
              key={card.id}
              card={card}
              onClick={() => setSelectedCard(card)}
            />
          ))}
        </div>
      )}
      {selectedCard && (
        <CardModal
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onImageClick={() => {
            if (selectedCard.imageUrl) {
              setSelectedCard(null);
              setLightboxUrl(selectedCard.imageUrl.replace("/normal/", "/large/"));
            }
          }}
        />
      )}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] overflow-auto bg-black/90 touch-pinch-zoom"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="min-h-full flex items-center justify-center p-4">
            <img
              src={lightboxUrl}
              alt="Full card art"
              className="max-h-[90vh] max-w-[90vw] object-contain cursor-zoom-out"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxUrl(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
