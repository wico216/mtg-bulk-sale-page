"use client";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  unit?: string;
}

function getPageNumbers(page: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (page <= 3) {
    return [1, 2, 3, 4, 5, "...", totalPages];
  }
  if (page >= totalPages - 2) {
    return [
      1,
      "...",
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }
  return [1, "...", page - 1, page, page + 1, "...", totalPages];
}

export function Pagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  unit = "cards",
}: PaginationProps) {
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  const pages = getPageNumbers(page, totalPages);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mt-4 py-3">
      <span className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>
        Showing {start.toLocaleString()}-{end.toLocaleString()} of{" "}
        {total.toLocaleString()} {unit}
      </span>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          aria-label="Previous page"
          className="px-2.5 h-8 rounded-md text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--ink)",
          }}
        >
          ←
        </button>

        {pages.map((p, i) => {
          if (p === "...") {
            return (
              <span
                key={`ellipsis-${i}`}
                className="min-w-[32px] h-8 flex items-center justify-center text-sm"
                style={{ color: "var(--muted)" }}
              >
                …
              </span>
            );
          }
          const isActive = p === page;
          return (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              aria-label={`Go to page ${p}`}
              aria-current={isActive ? "page" : undefined}
              className="min-w-[32px] h-8 flex items-center justify-center rounded-md text-sm font-medium transition-colors tabular-nums"
              style={{
                background: isActive ? "var(--accent)" : "transparent",
                color: isActive ? "var(--accent-fg)" : "var(--muted)",
              }}
            >
              {p}
            </button>
          );
        })}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          aria-label="Next page"
          className="px-2.5 h-8 rounded-md text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--ink)",
          }}
        >
          →
        </button>
      </div>
    </div>
  );
}
