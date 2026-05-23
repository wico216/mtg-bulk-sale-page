"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PublicCard, CardData } from "@/lib/types";
import FilterRail from "@/components/filter-rail";
import SortBar from "@/components/sort-bar";
import CardGrid from "@/components/card-grid";
import { useFilterStore } from "@/lib/store/filter-store";
import { useDebounce } from "@/lib/use-debounce";
import {
  DEFAULT_SORT,
  PRICE_MAX,
  STOREFRONT_PAGE_SIZE,
  type StorefrontFacets,
  type StorefrontPageData,
} from "@/lib/storefront";

interface StorefrontShellProps {
  cards: PublicCard[];
  meta: CardData["meta"];
  initialTotal: number;
  facets: StorefrontFacets;
}

const RAIL_COLLAPSED_KEY = "wiko.railCollapsed";

function useIsMobile(maxWidthPx = 767) {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidthPx}px)`);
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [maxWidthPx]);
  return mobile;
}

function IconSliders({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h14M20 18h0" strokeLinecap="round" />
      <circle cx="16" cy="6" r="2" fill="currentColor" />
      <circle cx="8" cy="12" r="2" fill="currentColor" />
      <circle cx="17" cy="18" r="2" fill="currentColor" />
    </svg>
  );
}

export default function StorefrontShell({ cards, meta, initialTotal, facets }: StorefrontShellProps) {
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pagedCards, setPagedCards] = useState(cards);
  const [filteredTotal, setFilteredTotal] = useState(initialTotal);
  const [nextOffset, setNextOffset] = useState<number | null>(
    cards.length < initialTotal ? cards.length : null,
  );
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const hasActiveFilters = useFilterStore((s) => s.hasActiveFilters);
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const selectedColors = useFilterStore((s) => s.selectedColors);
  const selectedSets = useFilterStore((s) => s.selectedSets);
  const selectedRarities = useFilterStore((s) => s.selectedRarities);
  const selectedTypes = useFilterStore((s) => s.selectedTypes);
  const selectedFinishes = useFilterStore((s) => s.selectedFinishes);
  const priceRange = useFilterStore((s) => s.priceRange);
  const sortBy = useFilterStore((s) => s.sortBy);
  const debouncedSearchQuery = useDebounce(searchQuery, 180);
  const filtersActive = hasActiveFilters();
  const firstFetchSkipped = useRef(false);
  const latestQueryKey = useRef("");
  const replacementRequestId = useRef(0);
  const loadMoreController = useRef<AbortController | null>(null);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearchQuery.trim()) params.set("q", debouncedSearchQuery.trim());
    if (selectedColors.size) params.set("colors", [...selectedColors].join(","));
    if (selectedSets.size) params.set("sets", [...selectedSets].join(","));
    if (selectedRarities.size) params.set("rarities", [...selectedRarities].join(","));
    if (selectedTypes.size) params.set("types", [...selectedTypes].join(","));
    if (selectedFinishes.size) params.set("finishes", [...selectedFinishes].join(","));
    if (priceRange[0] > 0) params.set("minPrice", String(priceRange[0]));
    if (priceRange[1] < PRICE_MAX) params.set("maxPrice", String(priceRange[1]));
    params.set("sort", sortBy);
    return params;
  }, [
    debouncedSearchQuery,
    selectedColors,
    selectedSets,
    selectedRarities,
    selectedTypes,
    selectedFinishes,
    priceRange,
    sortBy,
  ]);

  const queryKey = useMemo(() => queryParams.toString(), [queryParams]);

  const initialQueryKey = useMemo(() => {
    const params = new URLSearchParams();
    params.set("sort", DEFAULT_SORT);
    return params.toString();
  }, []);

  const fetchCards = useCallback(
    async ({ offset, signal }: { offset: number; signal?: AbortSignal }) => {
      const params = new URLSearchParams(queryParams);
      params.set("offset", String(offset));
      params.set("limit", String(STOREFRONT_PAGE_SIZE));
      const response = await fetch(`/api/cards?${params.toString()}`, { signal });
      if (!response.ok) throw new Error("Unable to load cards");
      return (await response.json()) as StorefrontPageData;
    },
    [queryParams],
  );

  useLayoutEffect(() => {
    latestQueryKey.current = queryKey;
  }, [queryKey]);

  // Hydrate rail collapse state from localStorage after mount — SSR-safe.
  useEffect(() => {
    try {
      if (localStorage.getItem(RAIL_COLLAPSED_KEY) === "1") setRailCollapsed(true);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(RAIL_COLLAPSED_KEY, railCollapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [railCollapsed]);

  const loadFirstPage = useCallback(
    async (signal?: AbortSignal) => {
      const requestQueryKey = queryKey;
      const requestId = ++replacementRequestId.current;

      loadMoreController.current?.abort();
      loadMoreController.current = null;
      setLoadingMore(false);
      setLoadError(null);
      setLoading(true);
      setPagedCards([]);
      setFilteredTotal(0);
      setNextOffset(null);

      try {
        const data = await fetchCards({ offset: 0, signal });
        if (
          signal?.aborted ||
          latestQueryKey.current !== requestQueryKey ||
          replacementRequestId.current !== requestId
        ) {
          return;
        }
        setPagedCards(data.cards);
        setFilteredTotal(data.total);
        setNextOffset(data.nextOffset);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        if (latestQueryKey.current !== requestQueryKey || replacementRequestId.current !== requestId) {
          return;
        }
        console.error("[STOREFRONT] Failed to load cards", error);
        setLoadError("Couldn’t load the shelves. Try again, adjust filters, or refresh.");
      } finally {
        if (
          !signal?.aborted &&
          latestQueryKey.current === requestQueryKey &&
          replacementRequestId.current === requestId
        ) {
          setLoading(false);
        }
      }
    },
    [fetchCards, queryKey],
  );

  // First paint receives the default first page from the server. If the client
  // filter store already has a non-default query (for example after client-side
  // navigation), fetch the matching page immediately instead of showing stale
  // default cards under active controls.
  useEffect(() => {
    latestQueryKey.current = queryKey;

    if (!firstFetchSkipped.current) {
      firstFetchSkipped.current = true;
      if (queryKey === initialQueryKey) return;
    }

    const controller = new AbortController();
    void loadFirstPage(controller.signal);

    return () => controller.abort();
  }, [initialQueryKey, loadFirstPage, queryKey]);

  const handleLoadMore = useCallback(async () => {
    if (nextOffset == null || loading || loadingMore) return;

    const requestQueryKey = queryKey;
    const controller = new AbortController();
    loadMoreController.current?.abort();
    loadMoreController.current = controller;
    setLoadingMore(true);
    setLoadError(null);

    try {
      const data = await fetchCards({ offset: nextOffset, signal: controller.signal });
      if (controller.signal.aborted || latestQueryKey.current !== requestQueryKey) return;
      setPagedCards((current) => [...current, ...data.cards]);
      setFilteredTotal(data.total);
      setNextOffset(data.nextOffset);
    } catch (error) {
      if ((error as Error).name !== "AbortError" && latestQueryKey.current === requestQueryKey) {
        console.error("[STOREFRONT] Failed to load more cards", error);
        setLoadError("Couldn’t load more cards. Try again or adjust filters.");
      }
    } finally {
      if (loadMoreController.current === controller) {
        loadMoreController.current = null;
        setLoadingMore(false);
      }
    }
  }, [fetchCards, loading, loadingMore, nextOffset, queryKey]);

  useEffect(() => {
    return () => loadMoreController.current?.abort();
  }, []);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  // Auto-close drawer if viewport grows past mobile breakpoint.
  useEffect(() => {
    if (!isMobile && mobileOpen) setMobileOpen(false);
  }, [isMobile, mobileOpen]);

  const needsInitialClientPage = !firstFetchSkipped.current && queryKey !== initialQueryKey;
  const visibleCards = needsInitialClientPage ? [] : pagedCards;
  const visibleFilteredTotal = needsInitialClientPage ? 0 : filteredTotal;
  const visibleNextOffset = needsInitialClientPage ? null : nextOffset;
  const visibleLoading = loading || needsInitialClientPage;

  if (isMobile) {
    return (
      <div>
        <main>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 16px 0",
            }}
          >
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: 3,
                background: "var(--surface-2)",
                color: "var(--ink)",
                fontSize: 12,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              <IconSliders />
              Filter
              {filtersActive && (
                <span
                  aria-hidden
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--accent)",
                    marginLeft: 2,
                  }}
                />
              )}
            </button>
          </div>
          <SortBar filteredCount={visibleFilteredTotal} />
          <CardGrid
            cards={visibleCards}
            filteredTotal={visibleFilteredTotal}
            inventoryTotal={facets.totalCards}
            loading={visibleLoading}
            loadingMore={loadingMore}
            hasMoreCards={visibleNextOffset != null && !loadError}
            onLoadMore={handleLoadMore}
            onRetry={() => void loadFirstPage()}
            errorMessage={loadError}
            meta={meta}
          />
        </main>
        {mobileOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
            onClick={(e) => {
              if (e.target === e.currentTarget) setMobileOpen(false);
            }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 60,
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <div
              style={{
                width: "min(360px, 100%)",
                height: "100%",
                background: "var(--bg)",
                overflowY: "auto",
                boxShadow: "-12px 0 24px rgba(0,0,0,0.25)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  padding: "10px 12px 0",
                }}
              >
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close filters"
                  style={{
                    background: "none",
                    border: "1px solid var(--border)",
                    borderRadius: 3,
                    color: "var(--ink)",
                    padding: "6px 10px",
                    fontSize: 12,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Done
                </button>
              </div>
              <FilterRail
                collapsed={false}
                onToggleCollapse={() => setMobileOpen(false)}
                embedded
                facets={facets}
                totalCount={facets.totalCards}
                filteredCount={visibleFilteredTotal}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "flex-start" }}>
      <FilterRail
        collapsed={railCollapsed}
        onToggleCollapse={() => setRailCollapsed((value) => !value)}
        facets={facets}
        totalCount={facets.totalCards}
        filteredCount={visibleFilteredTotal}
      />
      <main style={{ flex: 1, minWidth: 0 }}>
        <SortBar filteredCount={visibleFilteredTotal} />
        <CardGrid
          cards={visibleCards}
          filteredTotal={visibleFilteredTotal}
          inventoryTotal={facets.totalCards}
          loading={visibleLoading}
          loadingMore={loadingMore}
          hasMoreCards={visibleNextOffset != null && !loadError}
          onLoadMore={handleLoadMore}
          onRetry={() => void loadFirstPage()}
          errorMessage={loadError}
          meta={meta}
        />
      </main>
    </div>
  );
}
