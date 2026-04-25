"use client";

import { useEffect, useState } from "react";
import type { Card, CardData } from "@/lib/types";
import FilterRail from "@/components/filter-rail";
import SortBar from "@/components/sort-bar";
import CardGrid from "@/components/card-grid";
import { useFilterStore } from "@/lib/store/filter-store";

interface StorefrontShellProps {
  cards: Card[];
  meta: CardData["meta"];
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

export default function StorefrontShell({ cards, meta }: StorefrontShellProps) {
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();
  const hasActiveFilters = useFilterStore((s) => s.hasActiveFilters);
  const filtersActive = hasActiveFilters();

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
          <SortBar />
          <CardGrid cards={cards} meta={meta} />
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
      />
      <main style={{ flex: 1, minWidth: 0 }}>
        <SortBar />
        <CardGrid cards={cards} meta={meta} />
      </main>
    </div>
  );
}
