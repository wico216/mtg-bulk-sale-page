"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Card } from "@/lib/types";
import { useDebounce } from "@/lib/use-debounce";
import { conditionToAbbr } from "@/lib/condition-map";
import { EditableCell } from "./editable-cell";
import { DeleteConfirmation } from "./delete-confirmation";
import { Toast } from "./toast";
import { ActionBar } from "./action-bar";
import { Pagination } from "./pagination";

type SortField = "name" | "price" | "quantity";
type SortDir = "asc" | "desc";

function SortArrow({ direction }: { direction: SortDir }) {
  if (direction === "asc") {
    return (
      <svg
        className="inline w-3 h-3 ml-1"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
      </svg>
    );
  }
  return (
    <svg
      className="inline w-3 h-3 ml-1"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  );
}

export function InventoryTable() {
  const router = useRouter();
  const [cards, setCards] = useState<Card[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [sortBy, setSortBy] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useState("");
  const [setFilter, setSetFilter] = useState("");
  const [conditionFilter, setConditionFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"success" | "error">("error");
  const [availableSets, setAvailableSets] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  const debouncedSearch = useDebounce(search, 300);

  const fetchCards = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "50");
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (setFilter) params.set("set", setFilter);
      if (conditionFilter) params.set("condition", conditionFilter);
      if (sortBy) {
        params.set("sortBy", sortBy);
        params.set("sortDir", sortDir);
      }

      const res = await fetch(`/api/admin/cards?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setCards(data.cards);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, setFilter, conditionFilter, sortBy, sortDir]);

  // D-15: Post-import success toast handoff via sessionStorage.
  // import-client sets "admin-toast" to a JSON { message, variant: "success" } before router.push("/admin").
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem("admin-toast");
    if (!raw) return;
    window.sessionStorage.removeItem("admin-toast");
    try {
      const parsed = JSON.parse(raw) as { message: string; variant?: "success" | "error" };
      setToastMessage(parsed.message);
      setToastVariant(parsed.variant ?? "success");
    } catch {
      // malformed payload — ignore silently
    }
  }, []);

  // Fetch available sets on mount (all cards, no filter)
  useEffect(() => {
    async function fetchSets() {
      try {
        const res = await fetch("/api/admin/cards?limit=200");
        if (!res.ok) return;
        const data = await res.json();
        const sets = [
          ...new Set<string>(
            data.cards.map((c: Card) => c.setCode),
          ),
        ].sort();
        setAvailableSets(sets);
      } catch {
        // Non-critical, filters just won't have set options
      }
    }
    fetchSets();
  }, []);

  // Fetch cards whenever filters/sort/page changes
  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, setFilter, conditionFilter]);

  async function handleSave(
    cardId: string,
    field: string,
    value: string | number,
  ): Promise<boolean> {
    const res = await fetch(`/api/admin/cards/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.card) {
      setCards((prev) => prev.map((c) => (c.id === cardId ? data.card : c)));
    }
    return true;
  }

  async function handleDelete(cardId: string) {
    const res = await fetch(`/api/admin/cards/${cardId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setToastMessage("Failed to delete card. Try again.");
      setDeletingId(null);
      return;
    }
    setCards((prev) => prev.filter((c) => c.id !== cardId));
    setTotal((prev) => prev - 1);
    setDeletingId(null);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/admin/export");
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `viki-inventory-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setToastMessage("Failed to export CSV. Try again.");
    } finally {
      setExporting(false);
    }
  }

  function handleDeleteSuccess(deletedCount: number) {
    // Phase 10.1 D-14: green toast announcing the destructive action's outcome.
    // Same component-state toast pattern as Phase 10-03's import-success path,
    // except we DON'T need sessionStorage handoff — both producer (modal) and
    // consumer (this table) live on /admin already, no navigation occurs.
    setToastVariant("success");
    setToastMessage(`Deleted all ${deletedCount} cards`);
    // Re-fetch the (now empty) inventory so the table shows the empty state
    // and the ActionBar's currentTotal === 0 hides the Delete-all button (D-11).
    fetchCards();
    // Belt-and-suspenders: invalidate server caches in case any RSC layer
    // is reading the cards table elsewhere.
    router.refresh();
  }

  function handleSort(field: SortField) {
    if (sortBy !== field) {
      setSortBy(field);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      // Cycle back to unsorted
      setSortBy(null);
      setSortDir("asc");
    }
  }

  function getSortState(field: SortField): "ascending" | "descending" | "none" {
    if (sortBy !== field) return "none";
    return sortDir === "asc" ? "ascending" : "descending";
  }

  // Loading skeleton
  if (loading && cards.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse bg-zinc-200 dark:bg-zinc-800 rounded h-10 w-full"
          />
        ))}
      </div>
    );
  }

  // Error state
  if (error && cards.length === 0) {
    return (
      <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md p-4 text-sm text-red-600 dark:text-red-400">
        Failed to load inventory. Try refreshing the page.
      </div>
    );
  }

  // Empty states
  const hasFilters = debouncedSearch || setFilter || conditionFilter;
  if (total === 0 && !loading) {
    if (hasFilters) {
      return (
        <>
          <ActionBar
            search={search}
            onSearchChange={setSearch}
            setFilter={setFilter}
            onSetFilterChange={(v) => { setSetFilter(v); setPage(1); }}
            conditionFilter={conditionFilter}
            onConditionFilterChange={(v) => { setConditionFilter(v); setPage(1); }}
            availableSets={availableSets}
            exporting={exporting}
            onExport={handleExport}
            currentTotal={total}
            onDeleteSuccess={handleDeleteSuccess}
          />
          <div className="text-center py-12">
            <h2 className="text-lg font-semibold">No cards found</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Try a different search term or clear your filters.
            </p>
            <button
              onClick={() => {
                setSearch("");
                setSetFilter("");
                setConditionFilter("");
              }}
              className="mt-3 text-sm text-accent hover:text-accent-hover font-semibold"
            >
              Clear filters
            </button>
          </div>
        </>
      );
    }
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold">No cards in inventory</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Import a CSV file to add cards to your store.
        </p>
      </div>
    );
  }

  return (
    <>
      <ActionBar
        search={search}
        onSearchChange={setSearch}
        setFilter={setFilter}
        onSetFilterChange={(v) => { setSetFilter(v); setPage(1); }}
        conditionFilter={conditionFilter}
        onConditionFilterChange={(v) => { setConditionFilter(v); setPage(1); }}
        availableSets={availableSets}
        exporting={exporting}
        onExport={handleExport}
        currentTotal={total}
        onDeleteSuccess={handleDeleteSuccess}
      />

      <div className="w-full overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-800 text-left">
              <th className="px-4 py-3 text-sm font-semibold text-zinc-600 dark:text-zinc-400 w-12">
                Img
              </th>
              <th className="px-4 py-3 text-sm font-semibold text-zinc-600 dark:text-zinc-400 min-w-[160px]">
                <button
                  onClick={() => handleSort("name")}
                  aria-sort={getSortState("name")}
                  className={`cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-200 ${
                    sortBy === "name" ? "text-accent" : ""
                  }`}
                >
                  Name
                  {sortBy === "name" && <SortArrow direction={sortDir} />}
                </button>
              </th>
              <th className="px-4 py-3 text-sm font-semibold text-zinc-600 dark:text-zinc-400 w-20">
                Set
              </th>
              <th className="px-4 py-3 text-sm font-semibold text-zinc-600 dark:text-zinc-400 w-20">
                <button
                  onClick={() => handleSort("price")}
                  aria-sort={getSortState("price")}
                  className={`cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-200 ${
                    sortBy === "price" ? "text-accent" : ""
                  }`}
                >
                  Price
                  {sortBy === "price" && <SortArrow direction={sortDir} />}
                </button>
              </th>
              <th className="px-4 py-3 text-sm font-semibold text-zinc-600 dark:text-zinc-400 w-16">
                Cond
              </th>
              <th className="px-4 py-3 text-sm font-semibold text-zinc-600 dark:text-zinc-400 w-14">
                <button
                  onClick={() => handleSort("quantity")}
                  aria-sort={getSortState("quantity")}
                  className={`cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-200 ${
                    sortBy === "quantity" ? "text-accent" : ""
                  }`}
                >
                  Qty
                  {sortBy === "quantity" && <SortArrow direction={sortDir} />}
                </button>
              </th>
              <th className="px-4 py-3 text-sm font-semibold text-zinc-600 dark:text-zinc-400 w-12">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {cards.map((card) => {
              if (deletingId === card.id) {
                return (
                  <tr
                    key={card.id}
                    className="bg-red-50 dark:bg-red-950/20 border-b border-zinc-100 dark:border-zinc-800"
                  >
                    <td colSpan={7}>
                      <DeleteConfirmation
                        cardName={card.name}
                        onConfirm={() => handleDelete(card.id)}
                        onCancel={() => setDeletingId(null)}
                      />
                    </td>
                  </tr>
                );
              }

              const isLowStock = card.quantity === 1;

              return (
                <tr
                  key={card.id}
                  className={`border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 ${
                    isLowStock ? "border-l-2 border-amber-500" : ""
                  }`}
                >
                  <td className="px-4 py-2">
                    {card.imageUrl ? (
                      <img
                        src={card.imageUrl}
                        alt={card.name}
                        className="w-8 h-[45px] rounded object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-8 h-[45px] rounded bg-zinc-200 dark:bg-zinc-700" />
                    )}
                  </td>
                  <td className="px-4 py-2 truncate max-w-[200px]">
                    {card.name}
                  </td>
                  <td className="px-4 py-2 text-zinc-500 dark:text-zinc-400">
                    {card.setCode.toUpperCase()}
                  </td>
                  <td className="px-4 py-2">
                    <EditableCell
                      value={card.price ?? ""}
                      cardId={card.id}
                      field="price"
                      cardName={card.name}
                      onSave={handleSave}
                      onError={(msg) => setToastMessage(msg)}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <EditableCell
                      value={card.condition}
                      cardId={card.id}
                      field="condition"
                      cardName={card.name}
                      onSave={handleSave}
                      onError={(msg) => setToastMessage(msg)}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1.5">
                      <EditableCell
                        value={card.quantity}
                        cardId={card.id}
                        field="quantity"
                        cardName={card.name}
                        onSave={handleSave}
                        onError={(msg) => setToastMessage(msg)}
                      />
                      {isLowStock && (
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          Low
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => setDeletingId(card.id)}
                      aria-label={`Delete ${card.name}`}
                      className="text-zinc-400 hover:text-red-500 transition-colors"
                    >
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={50}
          onPageChange={setPage}
        />
      )}

      {toastMessage && (
        <Toast
          message={toastMessage}
          variant={toastVariant}
          onDismiss={() => {
            setToastMessage(null);
            setToastVariant("error");
          }}
        />
      )}
    </>
  );
}
