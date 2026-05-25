"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import type { PublicCard, CardData } from "@/lib/types";
import type { SortOption } from "@/lib/store/filter-store";
import { useFilterStore } from "@/lib/store/filter-store";
import CardTile from "@/components/card-tile";
import CardModal from "@/components/card-modal";
import { groupCardVariants, type CardVariantGroup } from "@/lib/card-variants";

interface CardGridProps {
  cards: PublicCard[];
  meta: CardData["meta"];
  initialSort?: SortOption;
}

export default function CardGrid({ cards, initialSort }: CardGridProps) {
  const setAllCards = useFilterStore((s) => s.setAllCards);
  const clearFilters = useFilterStore((s) => s.clearFilters);
  const getFilteredCards = useFilterStore((s) => s.getFilteredCards);
  const allCards = useFilterStore((s) => s.allCards);
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const selectedColors = useFilterStore((s) => s.selectedColors);
  const selectedSets = useFilterStore((s) => s.selectedSets);
  const selectedRarities = useFilterStore((s) => s.selectedRarities);
  const selectedTypes = useFilterStore((s) => s.selectedTypes);
  const selectedFinishes = useFilterStore((s) => s.selectedFinishes);
  const priceRange = useFilterStore((s) => s.priceRange);
  const sortBy = useFilterStore((s) => s.sortBy);
  const setSortBy = useFilterStore((s) => s.setSortBy);

  const filteredCards = useMemo(
    () => getFilteredCards(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      allCards,
      searchQuery,
      selectedColors,
      selectedSets,
      selectedRarities,
      selectedTypes,
      selectedFinishes,
      priceRange,
      sortBy,
    ],
  );

  const [selectedGroup, setSelectedGroup] = useState<CardVariantGroup | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const visibleGroups = useMemo(() => groupCardVariants(filteredCards), [filteredCards]);

  useEffect(() => {
    setAllCards(cards);
    if (initialSort) setSortBy(initialSort);
  }, [cards, initialSort, setAllCards, setSortBy]);

  useEffect(() => {
    if (selectedGroup || lightboxUrl) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedGroup, lightboxUrl]);

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
      {visibleGroups.length === 0 ? (
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
          className="wiko-card-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
            columnGap: 18,
            rowGap: 28,
            padding: "28px 32px 80px",
          }}
        >
          {visibleGroups.map((group) => (
            <CardTile
              key={group.id}
              card={group.card}
              variants={group.variants}
              onClick={() => setSelectedGroup(group)}
            />
          ))}
        </div>
      )}
      {selectedGroup && (
        <CardModal
          card={selectedGroup.card}
          variants={selectedGroup.variants}
          onClose={() => setSelectedGroup(null)}
          onImageClick={(imageUrl) => {
            setSelectedGroup(null);
            setLightboxUrl(imageUrl.replace("/normal/", "/large/"));
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
            <Image
              src={lightboxUrl}
              alt="Full card art"
              width={672}
              height={936}
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
