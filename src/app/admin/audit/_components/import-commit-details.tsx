"use client";

import { useState } from "react";
import type { AdminAuditEntry } from "@/db/queries";
import type { ScopedImportAuditMetadata } from "@/lib/import-contract";

const numberFormatter = new Intl.NumberFormat("en-US");

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/**
 * Phase 21 D-09 type guard. Returns true only when the metadata blob
 * carries the new ScopedImportAuditMetadata shape (Phase 19+); legacy
 * pre-Phase-19 import_commit rows fall through to the metadataPreview
 * render path (graceful degradation per CONTEXT D-09).
 */
function isScopedImportMetadata(m: unknown): m is ScopedImportAuditMetadata {
  if (!m || typeof m !== "object") return false;
  const candidate = m as Partial<ScopedImportAuditMetadata>;
  return (
    Array.isArray(candidate.selectedBinders) &&
    typeof candidate.totalCardsAfterImport === "number" &&
    !!candidate.scopedReplaceCounts &&
    typeof candidate.scopedReplaceCounts === "object"
  );
}

/**
 * Inline metadata preview that mirrors the legacy metadataPreview()
 * from audit-table.tsx. Used when the metadata fails the
 * ScopedImportAuditMetadata type guard (graceful degradation for
 * pre-Phase-19 import_commit entries).
 */
function legacyPreview(metadata: Record<string, unknown>): string {
  const entries = Object.entries(metadata);
  if (entries.length === 0) return "—";
  return entries
    .slice(0, 5)
    .map(([key, value]) => {
      const formatted =
        value === null || value === undefined
          ? "null"
          : typeof value === "object"
            ? JSON.stringify(value)
            : String(value);
      return `${key}: ${formatted}`;
    })
    .join(" · ");
}

/**
 * Phase 21 D-10 client island. Collapsed by default (one-line summary
 * "Replaced N binders (R rows)" + Show details button). Expanded view
 * renders the five sections per CONTEXT D-10:
 *   1. Selected binders ({n}): {comma-joined names}
 *   2. New: {names} OR (none)
 *   3. Missing: {names} OR (none)
 *   4. Per-binder counts: {binder}: {before} → {after} list
 *   5. Total inventory after: {totalCardsAfterImport}
 * Per planner deviation #4: only "after" is rendered (the metadata
 * shape captures totalCardsAfterImport but no totalCardsBeforeImport).
 */
export function ImportCommitDetails({
  entry,
}: {
  entry: AdminAuditEntry;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!isScopedImportMetadata(entry.metadata)) {
    return <span>{legacyPreview(entry.metadata)}</span>;
  }

  const meta = entry.metadata;
  const totalAfterRows = Object.values(meta.scopedReplaceCounts.after).reduce(
    (sum, n) => sum + n,
    0,
  );
  const newBindersDisplay =
    meta.newBindersInExport.length > 0
      ? meta.newBindersInExport.join(", ")
      : "(none)";
  const missingBindersDisplay =
    meta.missingBindersFromExport.length > 0
      ? meta.missingBindersFromExport.join(", ")
      : "(none)";
  // Per-binder list enumerates the union of before/after keys (a NEW
  // binder appears in `after` only — its before is 0).
  const perBinderEntries = Object.keys({
    ...meta.scopedReplaceCounts.before,
    ...meta.scopedReplaceCounts.after,
  }).sort();

  if (!expanded) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
        <span>
          Replaced {meta.selectedBinders.length}{" "}
          {meta.selectedBinders.length === 1 ? "binder" : "binders"}{" "}
          ({formatNumber(totalAfterRows)} rows)
        </span>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-xs font-semibold text-accent hover:text-accent-hover hover:underline"
        >
          Show details
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-xs text-zinc-600 dark:text-zinc-300">
      <div>
        <span className="font-semibold">
          Selected binders ({meta.selectedBinders.length}):
        </span>{" "}
        {meta.selectedBinders.join(", ")}
      </div>
      <div>
        <span className="font-semibold">New:</span> {newBindersDisplay}
      </div>
      <div>
        <span className="font-semibold">Missing:</span>{" "}
        {missingBindersDisplay}
      </div>
      <div>
        <span className="font-semibold">Per-binder counts:</span>
        <ul className="ml-4 mt-1 list-disc">
          {perBinderEntries.map((binder) => {
            const before = meta.scopedReplaceCounts.before[binder] ?? 0;
            const after = meta.scopedReplaceCounts.after[binder] ?? 0;
            return (
              <li key={binder} className="font-mono">
                {binder}: {formatNumber(before)} → {formatNumber(after)}
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        <span className="font-semibold">Total inventory after:</span>{" "}
        {formatNumber(meta.totalCardsAfterImport)}
      </div>
      <button
        type="button"
        onClick={() => setExpanded(false)}
        className="text-xs font-semibold text-accent hover:text-accent-hover hover:underline"
      >
        Hide details
      </button>
    </div>
  );
}
