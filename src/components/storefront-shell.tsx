"use client";

import { useEffect, useState } from "react";
import type { Card, CardData } from "@/lib/types";
import FilterRail from "@/components/filter-rail";
import SortBar from "@/components/sort-bar";
import CardGrid from "@/components/card-grid";

interface StorefrontShellProps {
  cards: Card[];
  meta: CardData["meta"];
}

const RAIL_COLLAPSED_KEY = "wiko.railCollapsed";

export default function StorefrontShell({ cards, meta }: StorefrontShellProps) {
  const [railCollapsed, setRailCollapsed] = useState(false);

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
