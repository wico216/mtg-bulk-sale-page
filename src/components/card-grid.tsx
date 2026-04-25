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

export default function CardGrid({ cards }: CardGridProps) {
  const setAllCards = useFilterStore((s) => s.setAllCards);
  const clearFilters = useFilterStore((s) => s.clearFilters);
  const getFilteredCards = useFilterStore((s) => s.getFilteredCards);
  const allCards = useFilterStore((s) => s.allCards);
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const selectedColors = useFilterStore((s) => s.selectedColors);
  const selectedSets = useFilterStore((s) => s.selectedSets);
  const selectedRarities = useFilterStore((s) => s.selectedRarities);
  const selectedFinishes = useFilterStore((s) => s.selectedFinishes);
  const priceRange = useFilterStore((s) => s.priceRange);
  const sortBy = useFilterStore((s) => s.sortBy);

  const filteredCards = useMemo(
    () => getFilteredCards(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      allCards,
      searchQuery,
      selectedColors,
      selectedSets,
      selectedRarities,
      selectedFinishes,
      priceRange,
      sortBy,
    ],
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
      <div style={{ padding: "80px 32px", textAlign: "center", color: "var(--muted)" }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 28,
            color: "var(--ink)",
            marginBottom: 8,
            fontStyle: "italic",
          }}
        >
          The shelves are bare.
        </div>
        <p style={{ fontSize: 13, margin: 0 }}>Run the inventory generator to stock up.</p>
      </div>
    );
  }

  return (
    <>
      {filteredCards.length === 0 ? (
        <div style={{ padding: "80px 32px", textAlign: "center", color: "var(--muted)" }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 28,
              color: "var(--ink)",
              marginBottom: 8,
              fontStyle: "italic",
            }}
          >
            Nothing here.
          </div>
          <p style={{ fontSize: 13, margin: 0 }}>
            Try widening the filters, or{" "}
            <button
              type="button"
              onClick={clearFilters}
              style={{
                background: "none",
                border: "none",
                color: "var(--accent)",
                textDecoration: "underline",
                textUnderlineOffset: 3,
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "inherit",
                padding: 0,
              }}
            >
              clear all
            </button>
            .
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            columnGap: 18,
            rowGap: 28,
            padding: "28px 32px 80px",
          }}
        >
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
          className="fixed inset-0 z-[60] overflow-auto touch-pinch-zoom"
          style={{ background: "rgba(0,0,0,0.9)" }}
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
    </>
  );
}
