"use client";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
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
}: PaginationProps) {
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  const pages = getPageNumbers(page, totalPages);

  return (
    <div className="flex items-center justify-between mt-4 py-3">
      <span className="text-xs text-zinc-500 dark:text-zinc-400">
        Showing {start}-{end} of {total} cards
      </span>

      <div className="flex items-center gap-1">
        {/* Previous Page button */}
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className={`px-3 h-8 rounded-md border border-zinc-300 dark:border-zinc-600 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
            page === 1 ? "opacity-30 cursor-not-allowed" : ""
          }`}
        >
          Previous Page
        </button>

        {/* Page number buttons */}
        {pages.map((p, i) => {
          if (p === "...") {
            return (
              <span
                key={`ellipsis-${i}`}
                className="min-w-[32px] h-8 flex items-center justify-center text-sm text-zinc-400"
              >
                ...
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
              className={`min-w-[32px] h-8 flex items-center justify-center rounded-md text-sm ${
                isActive
                  ? "bg-accent text-white font-semibold"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {p}
            </button>
          );
        })}

        {/* Next Page button */}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className={`px-3 h-8 rounded-md border border-zinc-300 dark:border-zinc-600 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
            page === totalPages ? "opacity-30 cursor-not-allowed" : ""
          }`}
        >
          Next Page
        </button>
      </div>
    </div>
  );
}
