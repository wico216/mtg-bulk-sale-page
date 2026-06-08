"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";
import Image from "next/image";
import type { PublicCard, CardData } from "@/lib/types";
import type { CardSelectionController } from "@/lib/card-selection";
import type { SortOption } from "@/lib/store/filter-store";
import { filterAndSortCards, useFilterStore } from "@/lib/store/filter-store";
import CardTile from "@/components/card-tile";
import CardModal from "@/components/card-modal";
import { groupCardVariants, type CardVariantGroup } from "@/lib/card-variants";

interface CardGridProps {
  cards: PublicCard[];
  meta: CardData["meta"];
  initialSort?: SortOption;
  virtualizeCards?: boolean;
  selectionController?: CardSelectionController;
}

const GRID_COLUMN_ESTIMATE = 2;
const GRID_ESTIMATED_ROW_HEIGHT_PX = 336;
const GRID_OVERSCAN_ROWS = 10;
const GRID_INITIAL_ROWS = 16;

interface VirtualRows {
  start: number;
  end: number;
}

function clampVirtualRow(value: number, totalRows: number): number {
  return Math.max(0, Math.min(totalRows, value));
}

export default function CardGrid({
  cards,
  initialSort,
  virtualizeCards = false,
  selectionController,
}: CardGridProps) {
  const setAllCards = useFilterStore((s) => s.setAllCards);
  const clearFilters = useFilterStore((s) => s.clearFilters);
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

  const storeCardsMatchProps = useMemo(
    () =>
      allCards.length === cards.length &&
      allCards.every((storeCard, index) => storeCard.id === cards[index]?.id),
    [allCards, cards],
  );
  const sourceCards = storeCardsMatchProps ? allCards : cards;

  const filteredCards = useMemo(
    () =>
      filterAndSortCards(sourceCards, {
        searchQuery,
        selectedColors,
        selectedSets,
        selectedRarities,
        selectedTypes,
        selectedFinishes,
        priceRange,
        sortBy,
      }),
    [
      sourceCards,
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
  const virtualizerRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const rowHeightLockedRef = useRef(false);
  const [gridColumns, setGridColumns] = useState(GRID_COLUMN_ESTIMATE);
  const [measuredRowHeight, setMeasuredRowHeight] = useState(
    GRID_ESTIMATED_ROW_HEIGHT_PX,
  );
  const [virtualRows, setVirtualRows] = useState<VirtualRows>({
    start: 0,
    end: GRID_INITIAL_ROWS,
  });
  const totalRows = Math.ceil(visibleGroups.length / gridColumns);

  const windowedGroups = useMemo(() => {
    if (!virtualizeCards) return visibleGroups;
    return visibleGroups.slice(
      virtualRows.start * gridColumns,
      virtualRows.end * gridColumns,
    );
  }, [gridColumns, visibleGroups, virtualRows, virtualizeCards]);

  const topSpacer = virtualizeCards ? virtualRows.start * measuredRowHeight : 0;
  const virtualContentHeight = virtualizeCards ? totalRows * measuredRowHeight : 0;

  const gridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
    columnGap: 18,
    rowGap: 28,
    padding: "28px 32px 80px",
  } as CSSProperties;

  const virtualizerStyle = virtualizeCards
    ? ({
        "--wiko-grid-virtual-content-height": `${virtualContentHeight}px`,
      } as CSSProperties)
    : undefined;

  const renderedGridStyle = virtualizeCards
    ? ({
        ...gridStyle,
        position: "absolute",
        inset: "0 0 auto 0",
        transform: `translate3d(0, ${topSpacer}px, 0)`,
        willChange: "transform",
      } as CSSProperties)
    : gridStyle;

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

  useEffect(() => {
    rowHeightLockedRef.current = false;
    const nextRows = virtualizeCards
      ? { start: 0, end: Math.min(totalRows, GRID_INITIAL_ROWS) }
      : { start: 0, end: GRID_INITIAL_ROWS };

    const frame = window.requestAnimationFrame(() => {
      setVirtualRows(nextRows);
      if (virtualizeCards) window.scrollTo({ top: 0 });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    searchQuery,
    selectedColors,
    selectedSets,
    selectedRarities,
    selectedTypes,
    selectedFinishes,
    priceRange,
    sortBy,
    totalRows,
    virtualizeCards,
  ]);

  useEffect(() => {
    if (!virtualizeCards) return;
    const grid = gridRef.current;
    const virtualizer = virtualizerRef.current;
    if (!grid) return;
    if (!virtualizer) return;

    let frame = 0;

    const measureGrid = () => {
      const computedColumns = getComputedStyle(grid)
        .gridTemplateColumns
        .split(" ")
        .filter(Boolean).length;
      const columnsForMeasurement = computedColumns || gridColumns;
      if (computedColumns > 0 && computedColumns !== gridColumns) {
        rowHeightLockedRef.current = false;
        setGridColumns(computedColumns);
      }

      if (rowHeightLockedRef.current) return;

      const tiles = grid.querySelectorAll<HTMLElement>(".wiko-tile");
      if (tiles.length <= columnsForMeasurement) return;
      const firstRow = tiles[0].getBoundingClientRect();
      const secondRow = tiles[columnsForMeasurement].getBoundingClientRect();
      const nextHeight = secondRow.top - firstRow.top;
      if (nextHeight > 120) {
        rowHeightLockedRef.current = true;
        if (Math.abs(nextHeight - measuredRowHeight) > 1) {
          setMeasuredRowHeight(nextHeight);
        }
      }
    };

    const updateWindow = () => {
      frame = 0;
      const rect = virtualizer.getBoundingClientRect();
      const gridTop = window.scrollY + rect.top;
      const viewportTop = Math.max(0, window.scrollY - gridTop);
      const viewportBottom = viewportTop + window.innerHeight;
      const start = clampVirtualRow(
        Math.floor(viewportTop / measuredRowHeight) - GRID_OVERSCAN_ROWS,
        totalRows,
      );
      const end = clampVirtualRow(
        Math.ceil(viewportBottom / measuredRowHeight) + GRID_OVERSCAN_ROWS,
        totalRows,
      );

      setVirtualRows((current) => {
        if (current.start === start && current.end === end) return current;
        return { start, end };
      });

      measureGrid();
    };

    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateWindow);
    };

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [gridColumns, measuredRowHeight, totalRows, virtualizeCards]);

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
        <>
          {virtualizeCards ? (
            <div
              ref={virtualizerRef}
              className="wiko-card-grid-virtualizer"
              data-virtualized="true"
              style={virtualizerStyle}
            >
              <div
                ref={gridRef}
                className="wiko-card-grid wiko-card-grid--virtualized"
                data-virtualized="true"
                style={renderedGridStyle}
              >
                {windowedGroups.map((group) => (
                  <CardTile
                    key={group.id}
                    card={group.card}
                    variants={group.variants}
                    selectionController={selectionController}
                    onClick={() => setSelectedGroup(group)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div ref={gridRef} className="wiko-card-grid" style={renderedGridStyle}>
              {windowedGroups.map((group) => (
                <CardTile
                  key={group.id}
                  card={group.card}
                  variants={group.variants}
                  selectionController={selectionController}
                  onClick={() => setSelectedGroup(group)}
                />
              ))}
            </div>
          )}
        </>
      )}
      {selectedGroup && (
        <CardModal
          card={selectedGroup.card}
          variants={selectedGroup.variants}
          selectionController={selectionController}
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
