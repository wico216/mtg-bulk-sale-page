"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { InventoryRow } from "@/lib/types";
import { useDebounce } from "@/lib/use-debounce";
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

function SelectAllCheckbox({
  checked,
  indeterminate,
  disabled,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label="Select all cards on this page"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      className="h-4 w-4 rounded border-zinc-300 text-accent focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}

export function InventoryTable() {
  const router = useRouter();
  const [cards, setCards] = useState<InventoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [sortBy, setSortBy] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useState("");
  const [setFilter, setSetFilter] = useState("");
  const [conditionFilter, setConditionFilter] = useState("");
  const [binderFilter, setBinderFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"success" | "error">("error");
  const [availableSets, setAvailableSets] = useState<string[]>([]);
  const [availableBinders, setAvailableBinders] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [inventoryTotal, setInventoryTotal] = useState(0);
  const [confirmingDeleteAll, setConfirmingDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [confirmingDeleteSelected, setConfirmingDeleteSelected] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);

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
      if (binderFilter) params.set("binder", binderFilter);
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
      if (!debouncedSearch && !setFilter && !conditionFilter && !binderFilter) {
        setInventoryTotal(data.total);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, setFilter, conditionFilter, binderFilter, sortBy, sortDir]);

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
            data.cards.map((c: InventoryRow) => c.setCode),
          ),
        ].sort();
        setAvailableSets(sets);
        // Phase 21 D-02: also derive distinct binders from the same response.
        // Mirrors the availableSets pattern; v1.3 acceptable for total
        // inventory of ~136-12,749 rows where limit=200 covers the vast
        // majority of binder names. Operators can still filter via URL
        // ?binder=... if a binder appears only in rows beyond the sample.
        const binders = [
          ...new Set<string>(
            data.cards.map((c: InventoryRow) => c.binder),
          ),
        ].sort();
        setAvailableBinders(binders);
        setInventoryTotal(data.total);
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

  // Reset page and selection when filters change
  useEffect(() => {
    setPage(1);
    setSelectedCardIds([]);
    setConfirmingDeleteSelected(false);
  }, [debouncedSearch, setFilter, conditionFilter, binderFilter]);

  // Clear selection when the visible page or sort order changes
  useEffect(() => {
    setSelectedCardIds([]);
    setConfirmingDeleteSelected(false);
  }, [page, sortBy, sortDir]);

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
      router.refresh();
    }
    return true;
  }

  async function handleDelete(cardId: string) {
    const res = await fetch(`/api/admin/cards/${cardId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setToastVariant("error");
      setToastMessage("Failed to delete card. Try again.");
      setDeletingId(null);
      return;
    }
    setCards((prev) => prev.filter((c) => c.id !== cardId));
    setTotal((prev) => prev - 1);
    setInventoryTotal((prev) => Math.max(0, prev - 1));
    setDeletingId(null);
    router.refresh();
  }

  async function handleDeleteAll() {
    setDeletingAll(true);
    try {
      const res = await fetch("/api/admin/cards", { method: "DELETE" });
      if (!res.ok) {
        let message = "Failed to delete inventory. Try again.";
        try {
          const body = await res.json();
          if (body?.error) message = body.error;
        } catch {}
        throw new Error(message);
      }

      const body = (await res.json()) as { success: true; deleted: number };
      setCards([]);
      setTotal(0);
      setTotalPages(0);
      setInventoryTotal(0);
      setAvailableSets([]);
      setSearch("");
      setSetFilter("");
      setConditionFilter("");
      setPage(1);
      setConfirmingDeleteAll(false);
      setToastVariant("success");
      setToastMessage(
        body.deleted === 1 ? "Deleted 1 card." : `Deleted ${body.deleted} cards.`,
      );
      router.refresh();
    } catch (err) {
      setToastVariant("error");
      setToastMessage(err instanceof Error ? err.message : "Failed to delete inventory. Try again.");
    } finally {
      setDeletingAll(false);
    }
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
      setToastVariant("error");
      setToastMessage("Failed to export CSV. Try again.");
    } finally {
      setExporting(false);
    }
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

  const selectedCardIdSet = new Set(selectedCardIds);
  const currentPageCardIds = cards.map((card) => card.id);
  const selectedCurrentPageCount = currentPageCardIds.filter((id) =>
    selectedCardIdSet.has(id),
  ).length;
  const allCurrentPageSelected =
    currentPageCardIds.length > 0 && selectedCurrentPageCount === currentPageCardIds.length;
  const someCurrentPageSelected =
    selectedCurrentPageCount > 0 && !allCurrentPageSelected;

  function toggleCardSelection(cardId: string, checked: boolean) {
    setConfirmingDeleteSelected(false);
    setSelectedCardIds((prev) => {
      if (checked) {
        return prev.includes(cardId) ? prev : [...prev, cardId];
      }
      return prev.filter((id) => id !== cardId);
    });
  }

  function toggleCurrentPageSelection(checked: boolean) {
    setConfirmingDeleteSelected(false);
    setSelectedCardIds((prev) => {
      if (checked) {
        return [...new Set([...prev, ...currentPageCardIds])];
      }
      const currentPageIds = new Set(currentPageCardIds);
      return prev.filter((id) => !currentPageIds.has(id));
    });
  }

  async function handleDeleteSelected() {
    if (selectedCardIds.length === 0) return;

    setDeletingSelected(true);
    try {
      const res = await fetch("/api/admin/cards/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedCardIds }),
      });
      if (!res.ok) {
        let message = "Failed to delete selected cards. Try again.";
        try {
          const body = await res.json();
          if (body?.error) message = body.error;
        } catch {}
        throw new Error(message);
      }

      const body = (await res.json()) as {
        success: true;
        deleted: number;
        ids: string[];
      };
      const deletedIds = new Set(body.ids);
      setCards((prev) => prev.filter((card) => !deletedIds.has(card.id)));
      setTotal((prev) => Math.max(0, prev - body.deleted));
      setInventoryTotal((prev) => Math.max(0, prev - body.deleted));
      setSelectedCardIds([]);
      setConfirmingDeleteSelected(false);
      setToastVariant("success");
      setToastMessage(
        body.deleted === 1
          ? "Deleted 1 selected card."
          : `Deleted ${body.deleted} selected cards.`,
      );
      router.refresh();
    } catch (err) {
      setToastVariant("error");
      setToastMessage(
        err instanceof Error ? err.message : "Failed to delete selected cards. Try again.",
      );
    } finally {
      setDeletingSelected(false);
    }
  }

  const deleteSelectedConfirmation = confirmingDeleteSelected ? (
    <div
      role="alert"
      className="mb-4 rounded-md p-4 text-sm"
      style={{
        background: "rgb(220 38 38 / 0.08)",
        borderLeft: "3px solid rgb(248 113 113)",
        color: "var(--ink)",
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">
            Delete {selectedCardIds.length} selected {selectedCardIds.length === 1 ? "card" : "cards"}?
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            This removes only the selected rows. Export first if you need a backup; successful deletion is recorded in Audit.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setConfirmingDeleteSelected(false)}
            disabled={deletingSelected}
            className="rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--ink)",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDeleteSelected}
            disabled={deletingSelected}
            className="rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "rgb(220 38 38)", color: "white" }}
          >
            {deletingSelected ? "Deleting…" : `Delete ${selectedCardIds.length}`}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const deleteAllConfirmation = confirmingDeleteAll ? (
    <div
      role="alert"
      className="mb-4 rounded-md p-4 text-sm"
      style={{
        background: "rgb(220 38 38 / 0.1)",
        borderLeft: "3px solid rgb(220 38 38)",
        color: "var(--ink)",
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">
            Delete all {inventoryTotal.toLocaleString()} cards from inventory?
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            This empties the storefront until you import a new CSV. Export first if you need a backup; successful deletion is recorded in Audit.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setConfirmingDeleteAll(false)}
            disabled={deletingAll}
            className="rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--ink)",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDeleteAll}
            disabled={deletingAll}
            className="rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "rgb(220 38 38)", color: "white" }}
          >
            {deletingAll
              ? "Deleting…"
              : `Delete ${inventoryTotal.toLocaleString()}`}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const toastElement = toastMessage ? (
    <Toast
      message={toastMessage}
      variant={toastVariant}
      onDismiss={() => {
        setToastMessage(null);
        setToastVariant("error");
      }}
    />
  ) : null;

  // Loading skeleton
  if (loading && cards.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded h-12 w-full"
            style={{ background: "var(--surface)" }}
          />
        ))}
      </div>
    );
  }

  // Error state
  if (error && cards.length === 0) {
    return (
      <div
        className="rounded-md p-4 text-sm"
        style={{
          background: "rgb(220 38 38 / 0.08)",
          borderLeft: "3px solid rgb(220 38 38)",
          color: "var(--ink)",
        }}
      >
        Failed to load inventory. Try refreshing the page.
      </div>
    );
  }

  // Empty states
  const hasFilters = debouncedSearch || setFilter || conditionFilter || binderFilter;
  if (total === 0 && !loading) {
    if (hasFilters) {
      return (
        <>
          <ActionBar
            search={search}
            onSearchChange={setSearch}
            setFilter={setFilter}
            onSetFilterChange={(v) => { setSetFilter(v); setPage(1); }}
            binderFilter={binderFilter}
            onBinderFilterChange={(v) => { setBinderFilter(v); setPage(1); }}
            conditionFilter={conditionFilter}
            onConditionFilterChange={(v) => { setConditionFilter(v); setPage(1); }}
            availableSets={availableSets}
            availableBinders={availableBinders}
            exporting={exporting}
            onExport={handleExport}
            deletingAll={deletingAll}
            deleteDisabled={inventoryTotal === 0}
            onRequestDeleteAll={() => setConfirmingDeleteAll(true)}
            selectedCount={selectedCardIds.length}
            deletingSelected={deletingSelected}
            onRequestDeleteSelected={() => setConfirmingDeleteSelected(true)}
            inventoryTotal={inventoryTotal}
          />
          {deleteSelectedConfirmation}
          {deleteAllConfirmation}
          <div
            className="text-center py-16 rounded-lg"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          >
            <h2
              className="text-lg font-semibold"
              style={{ color: "var(--ink)" }}
            >
              No cards match your filters
            </h2>
            <p
              className="text-sm mt-2"
              style={{ color: "var(--muted)" }}
            >
              Try a different search term or clear your filters.
            </p>
            <button
              onClick={() => {
                setSearch("");
                setSetFilter("");
                setConditionFilter("");
                setBinderFilter("");
              }}
              className="mt-4 inline-block text-sm font-semibold underline-offset-2 hover:underline"
              style={{ color: "var(--accent)" }}
            >
              Clear filters
            </button>
          </div>
          {toastElement}
        </>
      );
    }
    return (
      <>
        <ActionBar
          search={search}
          onSearchChange={setSearch}
          setFilter={setFilter}
          onSetFilterChange={(v) => { setSetFilter(v); setPage(1); }}
          binderFilter={binderFilter}
          onBinderFilterChange={(v) => { setBinderFilter(v); setPage(1); }}
          conditionFilter={conditionFilter}
          onConditionFilterChange={(v) => { setConditionFilter(v); setPage(1); }}
          availableSets={availableSets}
          availableBinders={availableBinders}
          exporting={exporting}
          onExport={handleExport}
          deletingAll={deletingAll}
          deleteDisabled={inventoryTotal === 0}
          onRequestDeleteAll={() => setConfirmingDeleteAll(true)}
          selectedCount={selectedCardIds.length}
          deletingSelected={deletingSelected}
          onRequestDeleteSelected={() => setConfirmingDeleteSelected(true)}
          inventoryTotal={inventoryTotal}
        />
        {deleteSelectedConfirmation}
        {deleteAllConfirmation}
        <div
          className="text-center py-20 rounded-lg"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div
            className="text-4xl mb-2"
            style={{ color: "var(--accent)", opacity: 0.6 }}
          >
            ✦
          </div>
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--ink)" }}
          >
            No cards in inventory
          </h2>
          <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
            Import a CSV file to add cards to your store.
          </p>
          <a
            href="/admin/import"
            className="mt-4 inline-block rounded-md px-4 py-2 text-sm font-semibold transition-colors"
            style={{
              background: "var(--accent)",
              color: "var(--accent-fg)",
            }}
          >
            Import CSV
          </a>
        </div>
        {toastElement}
      </>
    );
  }

  return (
    <>
      <ActionBar
        search={search}
        onSearchChange={setSearch}
        setFilter={setFilter}
        onSetFilterChange={(v) => { setSetFilter(v); setPage(1); }}
        binderFilter={binderFilter}
        onBinderFilterChange={(v) => { setBinderFilter(v); setPage(1); }}
        conditionFilter={conditionFilter}
        onConditionFilterChange={(v) => { setConditionFilter(v); setPage(1); }}
        availableSets={availableSets}
        availableBinders={availableBinders}
        exporting={exporting}
        onExport={handleExport}
        deletingAll={deletingAll}
        deleteDisabled={inventoryTotal === 0}
        onRequestDeleteAll={() => setConfirmingDeleteAll(true)}
        selectedCount={selectedCardIds.length}
        deletingSelected={deletingSelected}
        onRequestDeleteSelected={() => setConfirmingDeleteSelected(true)}
        inventoryTotal={inventoryTotal}
      />
      {deleteSelectedConfirmation}
      {deleteAllConfirmation}

      <div
        className="w-full overflow-x-auto rounded-lg"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-left"
              style={{
                background: "var(--surface-2)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <th className="w-10 px-4 py-3">
                <SelectAllCheckbox
                  checked={allCurrentPageSelected}
                  indeterminate={someCurrentPageSelected}
                  disabled={cards.length === 0}
                  onChange={toggleCurrentPageSelection}
                />
              </th>
              <th
                className="px-2 py-3 text-[11px] font-semibold uppercase tracking-wider w-12"
                style={{ color: "var(--muted)" }}
              >
                <span className="sr-only">Image</span>
              </th>
              <th
                className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider min-w-[160px]"
                style={{ color: "var(--muted)" }}
              >
                <button
                  onClick={() => handleSort("name")}
                  aria-sort={getSortState("name")}
                  className="transition-colors"
                  style={{
                    color: sortBy === "name" ? "var(--accent)" : "var(--muted)",
                  }}
                >
                  Name
                  {sortBy === "name" && <SortArrow direction={sortDir} />}
                </button>
              </th>
              <th
                className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider w-20"
                style={{ color: "var(--muted)" }}
              >
                Set
              </th>
              <th
                className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider w-24"
                style={{ color: "var(--muted)" }}
              >
                <button
                  onClick={() => handleSort("price")}
                  aria-sort={getSortState("price")}
                  className="transition-colors"
                  style={{
                    color: sortBy === "price" ? "var(--accent)" : "var(--muted)",
                  }}
                >
                  Price
                  {sortBy === "price" && <SortArrow direction={sortDir} />}
                </button>
              </th>
              <th
                className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider w-16"
                style={{ color: "var(--muted)" }}
              >
                Cond
              </th>
              {/* Phase 21 D-01: Binder column placement after Cond before Qty. */}
              <th
                className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider w-28"
                style={{ color: "var(--muted)" }}
              >
                Binder
              </th>
              <th
                className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider w-20"
                style={{ color: "var(--muted)" }}
              >
                <button
                  onClick={() => handleSort("quantity")}
                  aria-sort={getSortState("quantity")}
                  className="transition-colors"
                  style={{
                    color:
                      sortBy === "quantity" ? "var(--accent)" : "var(--muted)",
                  }}
                >
                  Qty
                  {sortBy === "quantity" && <SortArrow direction={sortDir} />}
                </button>
              </th>
              <th className="px-3 py-3 w-12">
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
                    style={{
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    {/* Phase 21 D-01: 9 columns (was 8) after Binder col added */}
                    <td colSpan={9}>
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
              const isZeroStock = card.quantity === 0;

              return (
                <tr
                  key={card.id}
                  className="transition-colors"
                  style={{
                    borderBottom: "1px solid var(--border)",
                    background: isZeroStock
                      ? "color-mix(in oklab, rgb(220 38 38) 6%, transparent)"
                      : "transparent",
                    borderLeft: isLowStock
                      ? "2px solid var(--accent)"
                      : isZeroStock
                      ? "2px solid rgb(220 38 38)"
                      : "2px solid transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!isZeroStock) {
                      e.currentTarget.style.background =
                        "color-mix(in oklab, var(--ink) 4%, transparent)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isZeroStock
                      ? "color-mix(in oklab, rgb(220 38 38) 6%, transparent)"
                      : "transparent";
                  }}
                >
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Select ${card.name}`}
                      checked={selectedCardIdSet.has(card.id)}
                      onChange={(event) =>
                        toggleCardSelection(card.id, event.target.checked)
                      }
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                  </td>
                  <td className="px-2 py-2">
                    {card.imageUrl ? (
                      <img
                        src={card.imageUrl}
                        alt=""
                        aria-hidden="true"
                        className="w-9 h-[50px] rounded object-cover"
                        style={{ border: "1px solid var(--border)" }}
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className="w-9 h-[50px] rounded"
                        style={{
                          background: "var(--surface-2)",
                          border: "1px solid var(--border)",
                        }}
                      />
                    )}
                  </td>
                  <td
                    className="px-3 py-2 truncate max-w-[260px]"
                    style={{ color: "var(--ink)" }}
                  >
                    {card.name}
                  </td>
                  <td
                    className="px-3 py-2 text-xs font-mono"
                    style={{ color: "var(--muted)" }}
                  >
                    {card.setCode.toUpperCase()}
                  </td>
                  <td className="px-3 py-2">
                    <EditableCell
                      value={card.price ?? ""}
                      cardId={card.id}
                      field="price"
                      cardName={card.name}
                      onSave={handleSave}
                      onError={(msg) => {
                        setToastVariant("error");
                        setToastMessage(msg);
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <EditableCell
                      value={card.condition}
                      cardId={card.id}
                      field="condition"
                      cardName={card.name}
                      onSave={handleSave}
                      onError={(msg) => {
                        setToastVariant("error");
                        setToastMessage(msg);
                      }}
                    />
                  </td>
                  {/* Phase 21 D-01: render binder verbatim (lowercase
                      normalized per Phase 17 D-04). */}
                  <td className="px-3 py-2">
                    <span
                      className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-md"
                      style={{
                        background: "var(--surface-2)",
                        color: "var(--muted)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {card.binder}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <EditableCell
                        value={card.quantity}
                        cardId={card.id}
                        field="quantity"
                        cardName={card.name}
                        onSave={handleSave}
                        onError={(msg) => {
                          setToastVariant("error");
                          setToastMessage(msg);
                        }}
                      />
                      {isLowStock && (
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded"
                          style={{
                            background:
                              "color-mix(in oklab, var(--accent) 20%, transparent)",
                            color: "var(--accent)",
                          }}
                          title="Only 1 copy remaining"
                        >
                          Low
                        </span>
                      )}
                      {isZeroStock && (
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded"
                          style={{
                            background: "rgb(220 38 38 / 0.2)",
                            color: "rgb(248 113 113)",
                          }}
                          title="Out of stock"
                        >
                          0
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => setDeletingId(card.id)}
                      aria-label={`Delete ${card.name}`}
                      className="transition-colors p-1 rounded"
                      style={{ color: "var(--muted)" }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = "rgb(248 113 113)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = "var(--muted)")
                      }
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

      {toastElement}
    </>
  );
}
