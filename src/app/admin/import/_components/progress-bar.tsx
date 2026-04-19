"use client";

interface ProgressBarProps {
  done: number;
  total: number;
  indeterminate?: boolean;
  label?: string; // defaults to "Enrichment progress"
}

export function ProgressBar({
  done,
  total,
  indeterminate = false,
  label = "Enrichment progress",
}: ProgressBarProps) {
  const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0;

  return (
    <div className="w-full space-y-2">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total || 100}
        aria-valuenow={done}
        className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden"
      >
        {indeterminate ? (
          <div className="h-full w-1/4 animate-pulse bg-zinc-300 dark:bg-zinc-700" />
        ) : (
          <div
            className="h-full bg-accent transition-[width] duration-150 ease-out"
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400" aria-live="polite">
        {indeterminate
          ? "Reading your file…"
          : `${done} / ${total} cards enriched`}
      </p>
    </div>
  );
}
