"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  PRICE_MAX,
  type PriceRange,
  useFilterStore,
} from "@/lib/store/filter-store";

const COLOR_KEYS = ["W", "U", "B", "R", "G"] as const;
type ColorKey = (typeof COLOR_KEYS)[number];

const COLOR_SWATCH: Record<ColorKey, string> = {
  W: "oklch(0.94 0.02 85)",
  U: "oklch(0.72 0.08 240)",
  B: "oklch(0.35 0.02 280)",
  R: "oklch(0.68 0.14 25)",
  G: "oklch(0.65 0.09 145)",
};

const RARITY_ORDER = ["mythic", "rare", "uncommon", "common"] as const;
const fmtRarity = (r: string) => r[0].toUpperCase() + r.slice(1);

function ColorGlyph({
  color,
  size = 14,
  fg = "rgba(0,0,0,0.75)",
}: {
  color: ColorKey;
  size?: number;
  fg?: string;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: fg,
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (color) {
    case "W":
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="4" fill={fg} stroke="none" />
          <g stroke={fg}>
            <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" />
          </g>
        </svg>
      );
    case "U":
      return (
        <svg {...common}>
          <path
            d="M10 3c2.5 3.2 4.5 5.8 4.5 8.3a4.5 4.5 0 1 1-9 0C5.5 8.8 7.5 6.2 10 3Z"
            fill={fg}
            stroke="none"
          />
        </svg>
      );
    case "B":
      return (
        <svg {...common}>
          <path d="M10 3 17 10 10 17 3 10Z" fill={fg} stroke="none" />
          <circle cx="10" cy="10" r="1.6" fill="var(--bg)" />
        </svg>
      );
    case "R":
      return (
        <svg {...common}>
          <path d="M10 3 17 16 3 16Z" fill={fg} stroke="none" />
        </svg>
      );
    case "G":
      return (
        <svg {...common}>
          <g fill={fg} stroke="none">
            <ellipse cx="10" cy="6" rx="2.2" ry="3.2" />
            <ellipse cx="6" cy="12" rx="2.2" ry="3.2" transform="rotate(-35 6 12)" />
            <ellipse cx="14" cy="12" rx="2.2" ry="3.2" transform="rotate(35 14 12)" />
            <rect x="9.3" y="11" width="1.4" height="5" rx="0.5" />
          </g>
        </svg>
      );
  }
}

function IconSearch({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

function IconX({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
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

function FilterSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section style={{ borderBottom: "1px solid var(--border)", padding: "14px 0" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 0,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--ink)",
          font: "inherit",
          fontFamily: "var(--font-display)",
          fontSize: 15,
          fontStyle: "italic",
          letterSpacing: "0.005em",
          fontWeight: 400,
        }}
      >
        <span>{title}</span>
        <span style={{ color: "var(--muted)", fontSize: 14 }}>{open ? "−" : "+"}</span>
      </button>
      {open && <div style={{ marginTop: 10 }}>{children}</div>}
    </section>
  );
}

function Checkbox({
  label,
  count,
  checked,
  onToggle,
}: {
  label: string;
  count?: number;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "4px 0",
        cursor: "pointer",
        fontSize: 13,
        color: "var(--ink)",
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          border: `1px solid ${checked ? "var(--accent)" : "var(--border-strong)"}`,
          background: checked ? "var(--accent)" : "transparent",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          transition: "all 0.12s",
        }}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--accent-fg)" strokeWidth="3">
            <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        style={{ display: "none" }}
      />
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {count != null && (
        <span style={{ color: "var(--muted)", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>{count}</span>
      )}
    </label>
  );
}

function ColorChip({
  color,
  checked,
  onToggle,
  count,
}: {
  color: ColorKey;
  checked: boolean;
  onToggle: () => void;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={`${color} · ${count}`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        padding: "6px 0",
        background: "none",
        border: "none",
        cursor: "pointer",
        flex: 1,
        color: "inherit",
        fontFamily: "inherit",
      }}
    >
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: "50%",
          background: COLOR_SWATCH[color],
          boxShadow: checked
            ? "0 0 0 2px var(--bg), 0 0 0 3.5px var(--accent)"
            : "inset 0 0 0 1px rgba(0,0,0,0.08)",
          transition: "all 0.12s",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ColorGlyph
          color={color}
          size={14}
          fg={color === "W" || color === "R" ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.75)"}
        />
      </span>
      <span
        style={{
          fontSize: 10,
          fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
          color: checked ? "var(--ink)" : "var(--muted)",
          letterSpacing: "0.05em",
        }}
      >
        {color}
      </span>
    </button>
  );
}

const sliderStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: 20,
  background: "none",
  appearance: "none",
  pointerEvents: "none",
  margin: 0,
  outline: "none",
};

function RangeSlider({
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  value: PriceRange;
  onChange: (v: PriceRange) => void;
  min: number;
  max: number;
  step?: number;
}) {
  const [lo, hi] = value;
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 8,
          fontSize: 12,
          color: "var(--muted)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span>${lo.toFixed(2)}</span>
        <span>
          ${hi.toFixed(2)}
          {hi >= max ? "+" : ""}
        </span>
      </div>
      <div style={{ position: "relative", height: 20 }}>
        <div
          style={{
            position: "absolute",
            top: 9,
            left: 0,
            right: 0,
            height: 2,
            background: "var(--border)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 9,
            height: 2,
            left: `${((lo - min) / (max - min)) * 100}%`,
            right: `${100 - ((hi - min) / (max - min)) * 100}%`,
            background: "var(--accent)",
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lo}
          onChange={(e) => {
            const next = Math.min(Number(e.target.value), hi - step);
            onChange([next, hi]);
          }}
          style={sliderStyle}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={hi}
          onChange={(e) => {
            const next = Math.max(Number(e.target.value), lo + step);
            onChange([lo, next]);
          }}
          style={sliderStyle}
        />
      </div>
    </div>
  );
}

function SetFilter({
  sets,
  counts,
  selected,
  onToggle,
}: {
  sets: string[];
  counts: Record<string, number>;
  selected: Set<string>;
  onToggle: (s: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return sets;
    return sets.filter((s) => s.toLowerCase().includes(needle));
  }, [sets, q]);

  return (
    <div>
      <div style={{ position: "relative", marginBottom: 8 }}>
        <span
          style={{
            position: "absolute",
            left: 8,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--muted)",
            lineHeight: 0,
          }}
        >
          <IconSearch size={12} />
        </span>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search sets"
          style={{
            width: "100%",
            padding: "6px 8px 6px 26px",
            fontSize: 12,
            border: "1px solid var(--border)",
            borderRadius: 3,
            background: "var(--surface-2)",
            color: "var(--ink)",
            outline: "none",
            fontFamily: "inherit",
            boxSizing: "border-box",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Clear set search"
            style={{
              position: "absolute",
              right: 4,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              color: "var(--muted)",
              cursor: "pointer",
              padding: 4,
              lineHeight: 0,
            }}
          >
            <IconX size={12} />
          </button>
        )}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          maxHeight: 240,
          overflowY: "auto",
          paddingRight: 4,
        }}
      >
        {filtered.length === 0 ? (
          <p style={{ margin: "8px 0", fontSize: 11, color: "var(--muted)" }}>No sets match.</p>
        ) : (
          filtered.map((s) => (
            <Checkbox
              key={s}
              label={s}
              count={counts[s]}
              checked={selected.has(s)}
              onToggle={() => onToggle(s)}
            />
          ))
        )}
      </div>
    </div>
  );
}

export interface FilterRailProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function FilterRail({ collapsed, onToggleCollapse }: FilterRailProps) {
  const allCards = useFilterStore((s) => s.allCards);
  const selectedColors = useFilterStore((s) => s.selectedColors);
  const selectedSets = useFilterStore((s) => s.selectedSets);
  const selectedRarities = useFilterStore((s) => s.selectedRarities);
  const selectedFinishes = useFilterStore((s) => s.selectedFinishes);
  const priceRange = useFilterStore((s) => s.priceRange);
  const setPriceRange = useFilterStore((s) => s.setPriceRange);
  const toggleColor = useFilterStore((s) => s.toggleColor);
  const toggleSet = useFilterStore((s) => s.toggleSet);
  const toggleRarity = useFilterStore((s) => s.toggleRarity);
  const toggleFinish = useFilterStore((s) => s.toggleFinish);
  const clearFilters = useFilterStore((s) => s.clearFilters);
  const hasActiveFilters = useFilterStore((s) => s.hasActiveFilters);
  const getFilteredCards = useFilterStore((s) => s.getFilteredCards);

  const filteredCount = getFilteredCards().length;
  const totalCount = allCards.length;

  const setCounts = useMemo(() => {
    const m: Record<string, number> = {};
    allCards.forEach((c) => {
      m[c.setName] = (m[c.setName] || 0) + 1;
    });
    return m;
  }, [allCards]);

  const rarityCounts = useMemo(() => {
    const m: Record<string, number> = {};
    allCards.forEach((c) => {
      m[c.rarity] = (m[c.rarity] || 0) + 1;
    });
    return m;
  }, [allCards]);

  const colorCounts = useMemo(() => {
    const m: Record<ColorKey, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
    allCards.forEach((c) =>
      c.colorIdentity.forEach((col) => {
        if (col in m) m[col as ColorKey]++;
      }),
    );
    return m;
  }, [allCards]);

  const sortedSets = useMemo(() => Object.keys(setCounts).sort(), [setCounts]);
  const rarities = RARITY_ORDER.filter((r) => rarityCounts[r]);

  if (collapsed) {
    return (
      <aside
        style={{
          width: 44,
          flexShrink: 0,
          borderRight: "1px solid var(--border)",
          position: "sticky",
          top: 68,
          height: "calc(100vh - 68px)",
          background: "var(--bg)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "16px 0",
        }}
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          title="Show filters"
          aria-label="Show filters"
          style={{
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: 3,
            color: "var(--ink)",
            padding: "7px 8px",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <IconSliders />
        </button>
        <div
          style={{
            marginTop: 16,
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            color: "var(--muted)",
          }}
        >
          Filter
        </div>
      </aside>
    );
  }

  return (
    <aside
      style={{
        width: 248,
        flexShrink: 0,
        borderRight: "1px solid var(--border)",
        padding: "20px 20px 40px",
        position: "sticky",
        top: 68,
        height: "calc(100vh - 68px)",
        overflowY: "auto",
        background: "var(--bg)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <h2
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontSize: 20,
            fontWeight: 400,
            letterSpacing: "0.005em",
            fontStyle: "italic",
          }}
        >
          Filter
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {hasActiveFilters() && (
            <button
              type="button"
              onClick={clearFilters}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontSize: 11,
                color: "var(--accent)",
                textDecoration: "underline",
                textUnderlineOffset: 3,
                fontFamily: "inherit",
              }}
            >
              Clear all
            </button>
          )}
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Hide filters"
            aria-label="Hide filters"
            style={{
              background: "none",
              border: "none",
              color: "var(--muted)",
              cursor: "pointer",
              padding: 2,
              lineHeight: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
        </div>
      </div>
      <p
        style={{
          margin: "4px 0 0",
          fontSize: 11,
          color: "var(--muted)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {filteredCount.toLocaleString()} of {totalCount.toLocaleString()} cards
      </p>

      <FilterSection title="Color">
        <div style={{ display: "flex", gap: 4 }}>
          {COLOR_KEYS.map((c) => (
            <ColorChip
              key={c}
              color={c}
              count={colorCounts[c]}
              checked={selectedColors.has(c)}
              onToggle={() => toggleColor(c)}
            />
          ))}
        </div>
      </FilterSection>

      <FilterSection title="Rarity">
        <div style={{ display: "flex", flexDirection: "column" }}>
          {rarities.map((r) => (
            <Checkbox
              key={r}
              label={fmtRarity(r)}
              count={rarityCounts[r]}
              checked={selectedRarities.has(r)}
              onToggle={() => toggleRarity(r)}
            />
          ))}
        </div>
      </FilterSection>

      <FilterSection title="Price">
        <RangeSlider
          value={priceRange}
          onChange={setPriceRange}
          min={0}
          max={PRICE_MAX}
          step={1}
        />
      </FilterSection>

      <FilterSection title="Finish">
        <div style={{ display: "flex", flexDirection: "column" }}>
          <Checkbox
            label="Foil"
            checked={selectedFinishes.has("foil")}
            onToggle={() => toggleFinish("foil")}
          />
          <Checkbox
            label="Nonfoil"
            checked={selectedFinishes.has("nonfoil")}
            onToggle={() => toggleFinish("nonfoil")}
          />
        </div>
      </FilterSection>

      <FilterSection title="Set" defaultOpen={false}>
        <SetFilter
          sets={sortedSets}
          counts={setCounts}
          selected={selectedSets}
          onToggle={toggleSet}
        />
      </FilterSection>
    </aside>
  );
}
