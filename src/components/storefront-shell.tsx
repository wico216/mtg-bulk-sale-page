"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicCard, CardData } from "@/lib/types";
import type { CardSelectionController } from "@/lib/card-selection";
import type { SortOption } from "@/lib/store/filter-store";
import FilterChips from "@/components/filter-chips";
import FilterRail from "@/components/filter-rail";
import SortBar from "@/components/sort-bar";
import CardGrid from "@/components/card-grid";
import { useFilterStore } from "@/lib/store/filter-store";

interface StorefrontShellProps {
  cards: PublicCard[];
  meta: CardData["meta"];
  initialSort?: SortOption;
  selectionController?: CardSelectionController;
}

const RAIL_COLLAPSED_KEY = "wiko.railCollapsed";
const MOBILE_CONTROLS_TOP_REVEAL_PX = 32;
const MOBILE_CONTROLS_HIDE_AFTER_PX = 96;
const MOBILE_CONTROLS_REVEAL_AFTER_PX = 48;
const MOBILE_CONTROLS_MIN_SCROLL_DELTA_PX = 2;
const MOBILE_CONTROLS_TOGGLE_COOLDOWN_MS = 180;

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

export default function StorefrontShell({
  cards,
  meta,
  initialSort,
  selectionController,
}: StorefrontShellProps) {
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileControlsHidden, setMobileControlsHidden] = useState(false);
  const mobileControlsHiddenRef = useRef(false);
  const lastScrollY = useRef(0);
  const scrollIntentDirection = useRef<0 | 1 | -1>(0);
  const scrollIntentDistance = useRef(0);
  const lastControlsToggleAt = useRef(0);
  const ticking = useRef(false);
  const isMobile = useIsMobile();
  const hasActiveFilters = useFilterStore((s) => s.hasActiveFilters);
  const selectedSets = useFilterStore((s) => s.selectedSets);
  const filtersActive = hasActiveFilters();
  const selectedSetNames = Array.from(selectedSets);
  const selectedSetSummary =
    selectedSetNames.length === 0
      ? null
      : selectedSetNames.length === 1
        ? `Set: ${selectedSetNames[0]}`
        : `${selectedSetNames.length} sets`;

  // Hydrate rail collapse state from localStorage after mount — SSR-safe.
  useEffect(() => {
    let frame = 0;
    try {
      if (localStorage.getItem(RAIL_COLLAPSED_KEY) === "1") {
        frame = window.requestAnimationFrame(() => setRailCollapsed(true));
      }
    } catch {
      // ignore
    }
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(RAIL_COLLAPSED_KEY, railCollapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [railCollapsed]);

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
    if (isMobile || !mobileOpen) return;
    const frame = window.requestAnimationFrame(() => setMobileOpen(false));
    return () => window.cancelAnimationFrame(frame);
  }, [isMobile, mobileOpen]);

  // Mobile storefront controls behave like Safari chrome: hide while scrolling
  // down to give cards more room, then reveal as soon as the user nudges upward.
  // The hysteresis keeps quick up/down flicks from making the whole control rail
  // flap, which feels choppy on mobile even when the scroll thread is healthy.
  useEffect(() => {
    if (!isMobile) {
      mobileControlsHiddenRef.current = mobileControlsHidden;
      scrollIntentDirection.current = 0;
      scrollIntentDistance.current = 0;
      return;
    }

    lastScrollY.current = window.scrollY;

    const resetScrollIntent = () => {
      scrollIntentDirection.current = 0;
      scrollIntentDistance.current = 0;
    };

    const setControlsHidden = (nextHidden: boolean, now: number, force = false) => {
      if (mobileControlsHiddenRef.current === nextHidden) return;
      if (!force && now - lastControlsToggleAt.current < MOBILE_CONTROLS_TOGGLE_COOLDOWN_MS) {
        return;
      }
      mobileControlsHiddenRef.current = nextHidden;
      lastControlsToggleAt.current = now;
      setMobileControlsHidden(nextHidden);
    };

    const updateVisibility = () => {
      const currentY = window.scrollY;
      const delta = currentY - lastScrollY.current;
      const absDelta = Math.abs(delta);
      const now = performance.now();

      if (currentY <= MOBILE_CONTROLS_TOP_REVEAL_PX) {
        setControlsHidden(false, now, true);
        resetScrollIntent();
        lastScrollY.current = currentY;
        ticking.current = false;
        return;
      }

      if (absDelta >= MOBILE_CONTROLS_MIN_SCROLL_DELTA_PX) {
        const direction: 1 | -1 = delta > 0 ? 1 : -1;
        if (scrollIntentDirection.current !== direction) {
          scrollIntentDirection.current = direction;
          scrollIntentDistance.current = absDelta;
        } else {
          scrollIntentDistance.current += absDelta;
        }

        if (
          direction === 1 &&
          !mobileControlsHiddenRef.current &&
          scrollIntentDistance.current >= MOBILE_CONTROLS_HIDE_AFTER_PX
        ) {
          setControlsHidden(true, now);
          scrollIntentDistance.current = 0;
        } else if (
          direction === -1 &&
          mobileControlsHiddenRef.current &&
          scrollIntentDistance.current >= MOBILE_CONTROLS_REVEAL_AFTER_PX
        ) {
          setControlsHidden(false, now);
          scrollIntentDistance.current = 0;
        }
      }

      lastScrollY.current = currentY;
      ticking.current = false;
    };

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      window.requestAnimationFrame(updateVisibility);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      ticking.current = false;
    };
  }, [isMobile, mobileControlsHidden]);

  if (isMobile) {
    return (
      <div>
        <main>
          <div
            className="wiko-mobile-storefront-controls"
            style={{
              position: "sticky",
              top: 68,
              zIndex: 40,
              background: "var(--bg)",
              borderBottom: "1px solid var(--border)",
              paddingBottom: 12,
              transform: mobileControlsHidden
                ? "translate3d(0, calc(-100% - 1px), 0)"
                : "translate3d(0, 0, 0)",
              transition: "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
              willChange: "transform",
              contain: "paint",
              backfaceVisibility: "hidden",
              pointerEvents: mobileControlsHidden ? "none" : "auto",
            }}
          >
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
                  flexShrink: 0,
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
              {selectedSetSummary && (
                <span
                  aria-live="polite"
                  title={selectedSetSummary}
                  style={{
                    minWidth: 0,
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    border: "1px solid var(--border)",
                    borderRadius: 999,
                    padding: "6px 10px",
                    color: "var(--ink-soft)",
                    background: "var(--surface)",
                    fontSize: 11,
                    lineHeight: 1.2,
                  }}
                >
                  {selectedSetSummary}
                </span>
              )}
            </div>
            <SortBar cards={cards} />
          </div>
          <CardGrid
            cards={cards}
            meta={meta}
            initialSort={initialSort}
            selectionController={selectionController}
            virtualizeCards
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
                cards={cards}
                embedded
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
        onToggleCollapse={() => setRailCollapsed((v) => !v)}
        cards={cards}
      />
      <main style={{ flex: 1, minWidth: 0 }}>
        {/* Search/sort stay pinned under the 68px header while the grid
            scrolls (mobile already does this via its own controls block).
            z-order: header 50 > mobile controls 40 > this 30 > grid. */}
        <div
          className="wiko-desktop-storefront-controls"
          style={{
            position: "sticky",
            top: 68,
            zIndex: 30,
            background: "var(--bg)",
            borderBottom: "1px solid var(--border)",
            paddingBottom: 14,
          }}
        >
          <SortBar cards={cards} />
        </div>
        {/* Removable active-filter chips — desktop only; mobile keeps its
            Filter-button dot + selected-set pill. Deliberately outside the
            sticky block: its height varies with active filters and a
            variable-height sticky header feels jumpy while scrolling. */}
        <FilterChips />
        <CardGrid
          cards={cards}
          meta={meta}
          initialSort={initialSort}
          selectionController={selectionController}
          virtualizeCards
        />
      </main>
    </div>
  );
}
