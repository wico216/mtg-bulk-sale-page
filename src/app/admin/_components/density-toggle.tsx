"use client";
import { useCallback, useSyncExternalStore } from "react";

export type RowDensity = "compact" | "standard" | "comfortable";

const STORAGE_KEY = "viki-admin-row-density";
const DEFAULT_DENSITY: RowDensity = "standard";
const DENSITIES: ReadonlyArray<{ value: RowDensity; label: string; sr: string }> = [
  { value: "compact", label: "C", sr: "Compact" },
  { value: "standard", label: "S", sr: "Standard" },
  { value: "comfortable", label: "L", sr: "Comfortable (large)" },
];

function isRowDensity(value: string | null): value is RowDensity {
  return value !== null && DENSITIES.some((d) => d.value === value);
}

function readDensity(): RowDensity {
  if (typeof window === "undefined") return DEFAULT_DENSITY;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isRowDensity(stored) ? stored : DEFAULT_DENSITY;
  } catch {
    return DEFAULT_DENSITY;
  }
}

function subscribeToDensity(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  // The `storage` event fires when localStorage is mutated in *another*
  // tab. Same-tab updates are pushed via window.dispatchEvent below.
  window.addEventListener("storage", callback);
  window.addEventListener("viki-density-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("viki-density-change", callback);
  };
}

function getServerSnapshot(): RowDensity {
  return DEFAULT_DENSITY;
}

/**
 * Bind the row-density preference to localStorage via
 * `useSyncExternalStore`. Avoids the setState-in-useEffect hydration
 * pattern that the React 19 lint rules now flag. The server always
 * returns DEFAULT_DENSITY (no localStorage); the client hydrates from
 * storage on first read. Same-tab updates dispatch a custom event so
 * every mounted hook stays in sync without us having to lift state.
 */
export function useRowDensity(): [RowDensity, (next: RowDensity) => void] {
  const density = useSyncExternalStore(
    subscribeToDensity,
    readDensity,
    getServerSnapshot,
  );

  const updateDensity = useCallback((next: RowDensity) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
      // Same-tab notification — `storage` only fires cross-tab.
      window.dispatchEvent(new Event("viki-density-change"));
    } catch {
      // Quota exceeded or storage disabled — ignore.
    }
  }, []);

  return [density, updateDensity];
}

export function DensityToggle({
  value,
  onChange,
}: {
  value: RowDensity;
  onChange: (next: RowDensity) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Row density"
      className="inline-flex items-center rounded-lg p-0.5"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
      }}
    >
      {DENSITIES.map((d) => {
        const active = d.value === value;
        return (
          <button
            key={d.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={d.sr}
            title={d.sr}
            onClick={() => onChange(d.value)}
            className="h-7 w-7 rounded-md text-[11px] font-semibold transition-colors"
            style={{
              background: active ? "var(--surface)" : "transparent",
              color: active ? "var(--ink)" : "var(--muted)",
              boxShadow: active
                ? "0 1px 2px color-mix(in oklab, var(--ink) 12%, transparent)"
                : undefined,
            }}
          >
            {d.label}
          </button>
        );
      })}
    </div>
  );
}
