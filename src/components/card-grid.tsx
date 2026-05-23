"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { PublicCard, CardData } from "@/lib/types";
import { useFilterStore } from "@/lib/store/filter-store";
import CardTile from "@/components/card-tile";
import CardModal from "@/components/card-modal";

interface CardGridProps {
  cards: PublicCard[];
  meta: CardData["meta"];
  inventoryTotal: number;
  filteredTotal: number;
  hasMoreCards: boolean;
  loading: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  errorMessage?: string | null;
}

export default function CardGrid({
  cards,
  inventoryTotal,
  filteredTotal,
  hasMoreCards,
  loading,
  loadingMore,
  onLoadMore,
  onRetry,
  errorMessage,
}: CardGridProps) {
  const clearFilters = useFilterStore((s) => s.clearFilters);
  const [selectedCard, setSelectedCard] = useState<PublicCard | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasMoreCards || loadingMore || errorMessage) return;
    const node = loadMoreRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { rootMargin: "800px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMoreCards, loadingMore, errorMessage, onLoadMore]);

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

  const errorPanel = errorMessage ? (
    <div style={{ padding: "32px", textAlign: "center", color: "var(--muted)" }}>
      <p style={{ margin: "0 0 12px" }}>{errorMessage}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={loading}
        style={{
          border: "1px solid var(--border)",
          borderRadius: 3,
          background: "var(--surface-2)",
          color: "var(--ink)",
          cursor: loading ? "wait" : "pointer",
          fontFamily: "inherit",
          fontSize: 12,
          letterSpacing: "0.08em",
          opacity: loading ? 0.7 : 1,
          padding: "10px 16px",
          textTransform: "uppercase",
        }}
      >
        Try again
      </button>
    </div>
  ) : null;

  if (inventoryTotal === 0) {
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
      {loading && cards.length === 0 ? (
        <div style={{ padding: "80px 32px", textAlign: "center", color: "var(--muted)" }}>
          Consulting the shelves…
        </div>
      ) : errorMessage && cards.length === 0 ? (
        errorPanel
      ) : filteredTotal === 0 ? (
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
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
              columnGap: 18,
              rowGap: 28,
              padding: hasMoreCards ? "28px 32px 28px" : "28px 32px 80px",
              opacity: loading ? 0.55 : 1,
              transition: "opacity 0.15s ease",
            }}
          >
            {cards.map((card) => (
              <CardTile
                key={card.id}
                card={card}
                onClick={() => setSelectedCard(card)}
              />
            ))}
          </div>
          {errorMessage && cards.length > 0 && errorPanel}
          {hasMoreCards && !errorMessage && (
            <div
              ref={loadMoreRef}
              style={{
                display: "flex",
                justifyContent: "center",
                padding: "0 32px 80px",
              }}
            >
              <button
                type="button"
                onClick={onLoadMore}
                disabled={loadingMore}
                aria-label={`Show more cards (${cards.length} of ${filteredTotal})`}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 3,
                  background: "var(--surface-2)",
                  color: "var(--ink)",
                  cursor: loadingMore ? "wait" : "pointer",
                  fontFamily: "inherit",
                  fontSize: 12,
                  letterSpacing: "0.08em",
                  opacity: loadingMore ? 0.7 : 1,
                  padding: "10px 16px",
                  textTransform: "uppercase",
                }}
              >
                {loadingMore ? "Loading…" : `Show more (${cards.length}/${filteredTotal})`}
              </button>
            </div>
          )}
        </>
      )}
      {selectedCard && (
        <CardModal
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onImageClick={(imageUrl) => {
            setSelectedCard(null);
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
