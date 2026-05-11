"use client";

import { useState } from "react";
import type { BinderSummary } from "@/lib/import-contract";

/**
 * Phase 19 D-13/D-14 — inline destructive confirmation.
 *
 * Mirrors the Phase 10 D-13 typed-phrase pattern verbatim: an input where
 * the operator types REPLACE; the commit button is disabled until the typed
 * phrase matches exactly. Above the input sits a per-binder breakdown
 * computed client-side from BinderSummary[] + the operator's selection +
 * the will-delete panel state.
 */

export interface BreakdownEntry {
  kind: "ADD" | "REPLACE" | "DELETE";
  binderName: string;
  /** rowCount is the count from the upload for ADD/REPLACE; 0 for DELETE
   * (the historical row count isn't on the wire — Plan 19-02 known
   *  limitation). DELETE entries render as "existing rows in <name>". */
  rowCount: number;
}

/**
 * Pure helper, exported for testability.
 */
export function computeBreakdown(
  binders: BinderSummary[],
  selection: Record<string, boolean>,
  willDeleteSelection: Record<string, boolean>,
  knownBinderNames: string[],
): BreakdownEntry[] {
  const knownSet = new Set(knownBinderNames);
  const entries: BreakdownEntry[] = [];
  const checkedBinders = binders.filter((b) => selection[b.name]);
  for (const b of checkedBinders) {
    entries.push({
      kind: knownSet.has(b.name) ? "REPLACE" : "ADD",
      binderName: b.name,
      rowCount: b.rowCount,
    });
  }
  for (const [name, checked] of Object.entries(willDeleteSelection)) {
    if (checked) {
      entries.push({ kind: "DELETE", binderName: name, rowCount: 0 });
    }
  }
  // Sort: ADDs first (they're the "new arrival" feel), then REPLACEs, then
  // DELETEs (the destructive ones). Within each kind: alpha by binderName.
  const order: Record<BreakdownEntry["kind"], number> = {
    ADD: 0,
    REPLACE: 1,
    DELETE: 2,
  };
  return entries.sort(
    (a, b) =>
      order[a.kind] - order[b.kind] ||
      a.binderName.localeCompare(b.binderName),
  );
}

const fmt = new Intl.NumberFormat("en-US");

export interface BinderConfirmProps {
  /** All binders from the upload (drives ADD/REPLACE classification). */
  binders: BinderSummary[];
  /** Operator's commit selection — keys are binder names, values are checked state. */
  selection: Record<string, boolean>;
  /** Will-delete entries (binders missing from upload that the operator has CHECKED). */
  willDeleteSelection: Record<string, boolean>;
  /** Operator's prior known binders, for the REPLACE vs ADD classification. */
  knownBinderNames: string[];
  committing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function BinderConfirm({
  binders,
  selection,
  willDeleteSelection,
  knownBinderNames,
  committing,
  onConfirm,
  onCancel,
}: BinderConfirmProps) {
  const [typed, setTyped] = useState("");

  const entries = computeBreakdown(
    binders,
    selection,
    willDeleteSelection,
    knownBinderNames,
  );
  const totalUpload = binders.reduce((sum, b) => sum + b.rowCount, 0);
  const canCommit = typed === "REPLACE" && entries.length > 0 && !committing;

  return (
    <div className="space-y-4 rounded-md border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20 p-4">
      <p className="text-sm font-semibold text-red-700 dark:text-red-300">
        This will:
      </p>
      <ul className="space-y-1 text-sm text-red-800 dark:text-red-200">
        {entries.map((e, i) => (
          <li
            key={`${e.kind}-${e.binderName}-${i}`}
            className="flex items-center gap-2"
          >
            <span className="font-mono uppercase tabular-nums w-20 inline-block">
              {e.kind}
            </span>
            <span>
              {e.kind === "DELETE"
                ? `existing rows in "${e.binderName}"`
                : `${fmt.format(e.rowCount)} rows in "${e.binderName}"`}
            </span>
            {e.kind === "ADD" && (
              <span className="ml-2 px-1.5 py-0.5 rounded bg-green-100 text-green-800 text-xs">
                NEW
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-red-600 dark:text-red-400">
        Total cards in upload: {fmt.format(totalUpload)}.
      </p>

      <div>
        <label
          className="block text-xs font-semibold text-red-700 dark:text-red-300 mb-1"
          htmlFor="binder-confirm-phrase"
        >
          Type REPLACE to confirm
        </label>
        <input
          id="binder-confirm-phrase"
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={committing}
          className="w-full px-3 py-2 text-sm border border-red-300 rounded-md focus:ring-2 focus:ring-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
          autoComplete="off"
        />
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={committing}
          className="px-4 py-2 text-sm font-semibold rounded-md border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canCommit}
          className="px-4 py-2 text-sm font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {committing ? (
            <span className="flex items-center gap-2">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                className="animate-spin"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeOpacity="0.25"
                />
                <path
                  d="M4 12a8 8 0 018-8"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              </svg>
              Importing…
            </span>
          ) : (
            "Commit import"
          )}
        </button>
      </div>
    </div>
  );
}
