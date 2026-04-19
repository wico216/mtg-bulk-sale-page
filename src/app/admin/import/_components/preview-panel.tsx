"use client";
import type { PreviewPayload } from "@/lib/import-contract";
import { conditionToAbbr } from "@/lib/condition-map";

interface PreviewPanelProps {
  preview: PreviewPayload;
  currentTotal: number;
}

export function PreviewPanel({ preview, currentTotal }: PreviewPanelProps) {
  const { toImport, parseSkipped, scryfallSkipped, missingPrices, sample, skippedRows } = preview;
  const totalSkipped = parseSkipped + scryfallSkipped;

  return (
    <div className="space-y-6">
      {/* Zone 1: Summary */}
      <section
        aria-labelledby="summary-heading"
        className="rounded-md border border-zinc-200 dark:border-zinc-800 p-4 space-y-1"
      >
        <h2
          id="summary-heading"
          className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3"
        >
          Summary
        </h2>
        <p className="text-sm">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{toImport}</span>{" "}
          cards will be imported
        </p>
        {parseSkipped > 0 && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            <span className="font-semibold">{parseSkipped}</span> rows skipped during parse
          </p>
        )}
        {scryfallSkipped > 0 && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            <span className="font-semibold">{scryfallSkipped}</span> cards not found on Scryfall
          </p>
        )}
        {missingPrices > 0 && (
          <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
            <span>
              <span className="font-semibold">{missingPrices}</span> cards missing a price
            </span>
          </p>
        )}
        <p className="text-xs text-zinc-500 dark:text-zinc-400 pt-2">
          This will replace your current inventory of {currentTotal} cards.
        </p>
      </section>

      {/* Zone 2: Sample */}
      {toImport > 0 && (
        <section
          aria-labelledby="sample-heading"
          className="rounded-md border border-zinc-200 dark:border-zinc-800 p-4"
        >
          <h2
            id="sample-heading"
            className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3"
          >
            Sample (first 20 cards)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-900">
                  <th
                    scope="col"
                    className="px-3 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 text-left"
                  >
                    Name
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 text-left"
                  >
                    Set
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 text-right"
                  >
                    Price
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 text-left"
                  >
                    Cond
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 text-right"
                  >
                    Qty
                  </th>
                </tr>
              </thead>
              <tbody>
                {sample.map((c) => (
                  <tr key={c.id}>
                    <td className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 max-w-[260px] truncate">
                      {c.name}
                    </td>
                    <td className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 uppercase">
                      {c.setCode}
                    </td>
                    <td className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 text-right tabular-nums">
                      {c.price != null ? `$${c.price.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
                      {conditionToAbbr(c.condition)}
                    </td>
                    <td className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 text-right tabular-nums">
                      {c.quantity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Zone 3: Skipped rows expander */}
      <details className="group">
        <summary className="cursor-pointer text-sm font-semibold text-zinc-700 dark:text-zinc-300 py-2 flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 rounded">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="transition-transform group-open:rotate-90"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          Skipped rows ({totalSkipped})
        </summary>
        {totalSkipped === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400 pl-4 py-2">
            No rows were skipped. Everything parsed cleanly.
          </p>
        ) : (
          <ul className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400 pl-4 pt-2">
            {skippedRows.map((row, i) => {
              if (row.kind === "parse") {
                const identifier = `${row.setCode ?? "?"}-${row.collectorNumber ?? "?"}`;
                return (
                  <li key={`parse-${i}`}>
                    Row {row.rowNumber} — {row.name ?? "(no name)"} (
                    <span className="font-mono text-xs">{identifier}</span>): {row.reason}
                  </li>
                );
              }
              return (
                <li key={`enrich-${i}`}>
                  {row.name} (
                  <span className="font-mono text-xs">
                    {row.setCode}-{row.collectorNumber}
                  </span>
                  ): <span className="text-red-600 dark:text-red-400">{row.reason}</span>
                </li>
              );
            })}
          </ul>
        )}
      </details>
    </div>
  );
}
