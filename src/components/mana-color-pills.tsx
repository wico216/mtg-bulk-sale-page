"use client";

import { useFilterStore } from "@/lib/store/filter-store";

const MANA_COLORS = [
  { code: "W", label: "White" },
  { code: "U", label: "Blue" },
  { code: "B", label: "Black" },
  { code: "R", label: "Red" },
  { code: "G", label: "Green" },
  { code: "C", label: "Colorless" },
] as const;

export default function ManaColorPills() {
  const selectedColors = useFilterStore((s) => s.selectedColors);
  const toggleColor = useFilterStore((s) => s.toggleColor);

  return (
    <div className="flex items-center gap-1.5">
      {MANA_COLORS.map(({ code, label }) => {
        const active = selectedColors.has(code);
        return (
          <button
            key={code}
            type="button"
            onClick={() => toggleColor(code)}
            aria-label={`Filter by ${label}`}
            aria-pressed={active}
            className={`inline-flex items-center justify-center rounded-full w-8 h-8 transition-colors cursor-pointer ${
              active
                ? "bg-accent/10 ring-2 ring-accent"
                : "bg-zinc-100 dark:bg-zinc-800 opacity-50 hover:opacity-75"
            }`}
          >
            <img
              src={`https://svgs.scryfall.io/card-symbols/${code}.svg`}
              alt={`{${code}}`}
              className="w-5 h-5"
            />
          </button>
        );
      })}
    </div>
  );
}
