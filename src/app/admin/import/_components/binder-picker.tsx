"use client";

import { useMemo } from "react";
import type { BinderSummary } from "@/lib/import-contract";
import { formatBinderForDisplay } from "@/lib/binder-name";

/**
 * Phase 19 — hand-rolled binder picker (D-03/D-04/D-05/D-08).
 *
 * Mirrors the multi-select-with-counts pattern from src/components/filter-rail.tsx
 * (no new UI primitive lib). Tailwind for styling so it matches the existing
 * import-client.tsx visual language.
 *
 * Sort order (D-05 + D-08):
 *   1. NEW binders alphabetical
 *   2. Existing binders alphabetical
 *   3. The `unsorted` binder LAST regardless of NEW status
 */

export interface BinderPickerProps {
  binders: BinderSummary[];
  /** Operator's prior selection (read-only here; updates flow through onToggle). */
  knownBinderNames: string[];
  /** Current checked state — `Record<binderName, boolean>`. Controlled by parent. */
  selection: Record<string, boolean>;
  /** Toggle callback. */
  onToggle: (binderName: string, checked: boolean) => void;
  /** Bulk set callback — used by Select all / Deselect all to flip every binder in ONE parent render (D-15). */
  onBulkSet: (binderNames: string[], checked: boolean) => void;
}

/**
 * Pure helper: which prior-selected binders are MISSING from this upload?
 * Drives the will-delete panel rendered in import-client.tsx (D-11/D-12).
 */
export function computeMissingBinders(
  bindersInUpload: BinderSummary[],
  knownBinderNames: string[],
): string[] {
  const uploadSet = new Set(bindersInUpload.map((b) => b.name));
  return knownBinderNames.filter((name) => !uploadSet.has(name)).sort();
}

const fmt = new Intl.NumberFormat("en-US");

export function BinderPicker({
  binders,
  selection,
  onToggle,
  onBulkSet,
}: BinderPickerProps) {
  const sorted = useMemo(() => {
    const newBinders: BinderSummary[] = [];
    const existing: BinderSummary[] = [];
    let unsorted: BinderSummary | null = null;
    for (const b of binders) {
      if (b.name === "unsorted") {
        unsorted = b;
      } else if (b.isNew) {
        newBinders.push(b);
      } else {
        existing.push(b);
      }
    }
    newBinders.sort((a, b) => a.name.localeCompare(b.name));
    existing.sort((a, b) => a.name.localeCompare(b.name));
    return [...newBinders, ...existing, ...(unsorted ? [unsorted] : [])];
  }, [binders]);

  const selectedCount = binders.filter((b) => selection[b.name]).length;

  return (
    <section
      aria-labelledby="binder-picker-heading"
      className="rounded-md border border-zinc-200 dark:border-zinc-800 p-4"
    >
      <header className="flex items-center justify-between mb-3">
        <h2
          id="binder-picker-heading"
          className="text-sm font-semibold text-zinc-700 dark:text-zinc-300"
        >
          Select binders to import ({selectedCount} of {binders.length})
        </h2>
        <div className="flex items-center gap-2">
          <button type="button"
            onClick={() =>
              onBulkSet(
                binders.map((b) => b.name),
                true,
              )
            }
            className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            Select all
          </button>
          <button type="button"
            onClick={() =>
              onBulkSet(
                binders.map((b) => b.name),
                false,
              )
            }
            className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            Deselect all
          </button>
        </div>
      </header>
      <div className="space-y-2">
        {sorted.map((binder) => {
          const checked = selection[binder.name] ?? false;
          const isLegacy = binder.name === "unsorted";
          const showNew = binder.isNew && !isLegacy;
          return (
            <div key={binder.name}>
              <label className="flex items-center gap-3 py-2 px-3 hover:bg-zinc-50 dark:hover:bg-zinc-900 cursor-pointer rounded">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => onToggle(binder.name, e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300 text-accent focus:ring-accent"
                />
                <span className="flex-1 text-sm text-zinc-900 dark:text-zinc-100 truncate">
                  {formatBinderForDisplay(binder.name)}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                  {fmt.format(binder.rowCount)}
                </span>
                {showNew && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
                    NEW
                  </span>
                )}
                {isLegacy && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                    Legacy
                  </span>
                )}
              </label>
              {binder.sampleNames.length > 0 && (
                <p className="pl-10 pr-3 pb-1 text-xs text-zinc-400 dark:text-zinc-500 truncate">
                  {binder.sampleNames.slice(0, 5).join(", ")}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
