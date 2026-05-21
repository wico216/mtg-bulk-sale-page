"use client";

import { useMemo } from "react";
import { formatBinderForDisplay } from "@/lib/binder-name";
import { binderColor } from "./binder-color";

export type InventorySortKey =
  | "name-asc"
  | "name-desc"
  | "quantity-desc"
  | "quantity-asc"
  | "price-desc"
  | "price-asc";

interface FilterRailProps {
  binderFilter: string;
  onBinderFilterChange: (value: string) => void;
  availableBinders: string[];
  setFilter: string;
  onSetFilterChange: (value: string) => void;
  availableSets: string[];
  conditionFilter: string;
  onConditionFilterChange: (value: string) => void;
  onReset: () => void;
  hasActiveFilter: boolean;
  // Optional: total cards in the unfiltered universe, shown next to "All".
  totalUniverse: number;
}

/**
 * Group heading — mono, uppercase, wide-tracked. Used as the only chrome
 * between rail groups; no dividers, just rhythm.
 */
function GroupHead({ title }: { title: string }) {
  return (
    <h4
      className="m-0 mb-2.5 px-1"
      style={{
        fontFamily: "var(--font-geist-mono), monospace",
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: "0.2em",
        lineHeight: 1,
        textTransform: "uppercase",
        color: "var(--dim)",
      }}
    >
      {title}
    </h4>
  );
}

/**
 * One option row in a rail group. The mockup's `.rail__opt` style:
 * leading swatch / glyph, mono label, trailing count. Active state
 * tints the row in accent-tinted surface.
 */
function RailOption({
  active,
  onClick,
  leading,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  leading: React.ReactNode;
  label: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active}
      className="w-full flex items-center gap-2 px-2 py-1 rounded text-left transition-colors"
      style={{
        background: active
          ? "color-mix(in oklab, var(--accent) 16%, transparent)"
          : "transparent",
        color: active ? "var(--ink)" : "var(--muted)",
        fontSize: 12,
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background =
            "color-mix(in oklab, var(--ink) 4%, transparent)";
          e.currentTarget.style.color = "var(--ink)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--muted)";
        }
      }}
    >
      {leading}
      <span
        className="truncate"
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11,
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </span>
      {typeof count === "number" && (
        <span
          className="ml-auto tabular-nums"
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 10,
            color: active ? "var(--accent)" : "var(--dim)",
          }}
        >
          {count.toLocaleString()}
        </span>
      )}
    </button>
  );
}

const CONDITION_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "All conditions" },
  { value: "near_mint", label: "Near mint" },
  { value: "lightly_played", label: "Lightly played" },
  { value: "moderately_played", label: "Moderately played" },
  { value: "heavily_played", label: "Heavily played" },
  { value: "damaged", label: "Damaged" },
];

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="w-full rounded px-2 py-1.5 text-xs focus:outline-none"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        color: "var(--ink)",
        fontFamily: "var(--font-geist-mono), monospace",
        letterSpacing: "0.04em",
      }}
    >
      {children}
    </select>
  );
}

export function FilterRail({
  binderFilter,
  onBinderFilterChange,
  availableBinders,
  setFilter,
  onSetFilterChange,
  availableSets,
  conditionFilter,
  onConditionFilterChange,
  onReset,
  hasActiveFilter,
  totalUniverse,
}: FilterRailProps) {
  // Sort binders so "unsorted" sinks to the bottom; everything else
  // alphabetical. The operator's primary binders ("a02", "a05") naturally
  // surface to the top — matches their physical labelling order.
  const sortedBinders = useMemo(() => {
    return [...availableBinders].sort((a, b) => {
      if (a === "unsorted" && b !== "unsorted") return 1;
      if (b === "unsorted" && a !== "unsorted") return -1;
      return a.localeCompare(b);
    });
  }, [availableBinders]);

  const railBody = (
    <div className="space-y-6 text-xs" style={{ fontSize: 12 }}>
      <section>
        <GroupHead
          title={`Binder · ${sortedBinders.length.toLocaleString()}`}
        />
        <div className="space-y-0.5">
          {/* "All" + the currently-selected binder stay always visible so the
              operator can see what's filtered without opening the disclosure.
              The full list (20+ binders) lives inside the <details> below so
              it doesn't push Set + Condition off-screen on a normal laptop. */}
          <RailOption
            active={binderFilter === ""}
            onClick={() => onBinderFilterChange("")}
            leading={
              <span
                aria-hidden="true"
                className="shrink-0 rounded-[2px]"
                style={{
                  width: 8,
                  height: 14,
                  background: "transparent",
                  border: "1px dashed var(--border)",
                }}
              />
            }
            label="All"
            count={totalUniverse}
          />
          {binderFilter !== "" && sortedBinders.includes(binderFilter) && (
            <RailOption
              active
              onClick={() => onBinderFilterChange(binderFilter)}
              leading={
                <span
                  aria-hidden="true"
                  className="shrink-0 rounded-[2px]"
                  style={{
                    width: 8,
                    height: 14,
                    background: binderColor(binderFilter),
                  }}
                />
              }
              label={formatBinderForDisplay(binderFilter)}
            />
          )}
        </div>
        <details className="mt-1.5 group/binders">
          <summary
            className="cursor-pointer list-none flex items-center justify-between px-2 py-1 rounded transition-colors"
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 11,
              letterSpacing: "0.04em",
              color: "var(--muted)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--ink)";
              e.currentTarget.style.background =
                "color-mix(in oklab, var(--ink) 4%, transparent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--muted)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            <span>
              <span
                className="inline-block transition-transform group-open/binders:rotate-90"
                style={{ width: 10 }}
                aria-hidden="true"
              >
                ›
              </span>{" "}
              Show all binders
            </span>
            <span
              className="tabular-nums"
              style={{ color: "var(--dim)", fontSize: 10 }}
            >
              {sortedBinders.length.toLocaleString()}
            </span>
          </summary>
          <div className="mt-1 space-y-0.5">
            {sortedBinders.map((b) => (
              <RailOption
                key={b}
                active={binderFilter === b}
                onClick={() => onBinderFilterChange(b)}
                leading={
                  <span
                    aria-hidden="true"
                    className="shrink-0 rounded-[2px]"
                    style={{
                      width: 8,
                      height: 14,
                      background: binderColor(b),
                    }}
                  />
                }
                label={formatBinderForDisplay(b)}
              />
            ))}
          </div>
        </details>
      </section>

      {availableSets.length > 0 && (
        <section>
          <GroupHead title="Set" />
          <FilterSelect
            label="Filter by set"
            value={setFilter}
            onChange={onSetFilterChange}
          >
            <option value="">All sets</option>
            {availableSets.map((s) => (
              <option key={s} value={s}>
                {s.toUpperCase()}
              </option>
            ))}
          </FilterSelect>
        </section>
      )}

      <section>
        <GroupHead title="Condition" />
        <FilterSelect
          label="Filter by condition"
          value={conditionFilter}
          onChange={onConditionFilterChange}
        >
          {CONDITION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </FilterSelect>
      </section>

      {hasActiveFilter && (
        <button
          type="button"
          onClick={onReset}
          className="text-[11px] underline-offset-2 hover:underline"
          style={{
            color: "var(--muted)",
            fontFamily: "var(--font-geist-mono), monospace",
            letterSpacing: "0.04em",
          }}
        >
          Reset filters
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile: collapsible accordion */}
      <details
        className="lg:hidden rounded-lg"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        <summary
          className="cursor-pointer list-none px-4 py-3 flex items-center justify-between"
          style={{ color: "var(--ink)" }}
        >
          <span className="text-sm font-semibold">Filters</span>
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            {hasActiveFilter ? "Active" : "Tap to expand"}
          </span>
        </summary>
        <div
          className="px-4 pb-4 pt-2"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          {railBody}
        </div>
      </details>

      {/* Desktop: sticky left rail */}
      <aside
        className="hidden lg:block lg:sticky lg:top-[80px] lg:self-start lg:max-h-[calc(100vh-96px)] lg:overflow-y-auto lg:py-4 lg:pr-4"
        aria-label="Inventory filters"
        style={{
          borderRight: "1px solid var(--border)",
        }}
      >
        {railBody}
      </aside>
    </>
  );
}
