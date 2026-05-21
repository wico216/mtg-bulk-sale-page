"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { InventoryRow } from "@/lib/types";
import { useDebounce } from "@/lib/use-debounce";
import { DeleteConfirmation } from "./delete-confirmation";
import { Toast } from "./toast";
import { ActionBar } from "./action-bar";
import { Pagination } from "./pagination";
import { FilterRail, type InventorySortKey } from "./filter-rail";
import { InventoryRowCard } from "./inventory-row";
import { SelectionDock } from "./selection-dock";
import { InventoryDangerZone } from "./inventory-danger-zone";
import { useRowDensity } from "./density-toggle";
import { InventoryLightbox } from "./inventory-lightbox";

function sortKeyToParams(
  sort: InventorySortKey,
): { sortBy: "name" | "price" | "quantity"; sortDir: "asc" | "desc" } {
  switch (sort) {
    case "name-asc":
      return { sortBy: "name", sortDir: "asc" };
    case "name-desc":
      return { sortBy: "name", sortDir: "desc" };
    case "quantity-desc":
      return { sortBy: "quantity", sortDir: "desc" };
    case "quantity-asc":
      return { sortBy: "quantity", sortDir: "asc" };
    case "price-desc":
      return { sortBy: "price", sortDir: "desc" };
    case "price-asc":
      return { sortBy: "price", sortDir: "asc" };
  }
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
      className="h-4 w-4 cursor-pointer accent-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}

export function InventoryTable() {
  const router = useRouter();
  const [cards, setCards] = useState<InventoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [sort, setSort] = useState<InventorySortKey>("name-asc");
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
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [confirmingDeleteSelected, setConfirmingDeleteSelected] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [density, setDensity] = useRowDensity();
  const [inspectingCard, setInspectingCard] = useState<InventoryRow | null>(
    null,
  );

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
      const { sortBy, sortDir } = sortKeyToParams(sort);
      params.set("sortBy", sortBy);
      params.set("sortDir", sortDir);

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
  }, [page, debouncedSearch, setFilter, conditionFilter, binderFilter, sort]);

  // D-15: Post-import success toast handoff via sessionStorage.
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

  // Fetch available sets + binders on mount
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
  }, [page, sort]);

  // ─── Handlers ─────────────────────────────────────────────────

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
      setToastVariant("success");
      setToastMessage(
        body.deleted === 1 ? "Deleted 1 card." : `Deleted ${body.deleted} cards.`,
      );
      router.refresh();
    } catch (err) {
      setToastVariant("error");
      setToastMessage(
        err instanceof Error ? err.message : "Failed to delete inventory. Try again.",
      );
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
      a.download = `wikos-spellbook-inventory-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setToastVariant("error");
      setToastMessage("Failed to export CSV. Try again.");
    } finally {
      setExporting(false);
    }
  }

  // ─── Selection ────────────────────────────────────────────────

  const selectedCardIdSet = new Set(selectedCardIds);
  const currentPageCardIds = cards.map((card) => card.id);
  const selectedCurrentPageCount = currentPageCardIds.filter((id) =>
    selectedCardIdSet.has(id),
  ).length;
  const allCurrentPageSelected =
    currentPageCardIds.length > 0 &&
    selectedCurrentPageCount === currentPageCardIds.length;
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
        err instanceof Error
          ? err.message
          : "Failed to delete selected cards. Try again.",
      );
    } finally {
      setDeletingSelected(false);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────

  const hasFilter = Boolean(
    debouncedSearch || setFilter || conditionFilter || binderFilter,
  );

  function resetFilters() {
    setSearch("");
    setSetFilter("");
    setConditionFilter("");
    setBinderFilter("");
  }

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

  // ─── Confirmation banner above row list (for bulk delete) ────

  const deleteSelectedConfirmation = confirmingDeleteSelected ? (
    <div
      role="alert"
      className="rounded-xl p-4 text-sm mb-3"
      style={{
        background: "rgb(220 38 38 / 0.08)",
        border: "1px solid rgb(220 38 38 / 0.3)",
        color: "var(--ink)",
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">
            Delete {selectedCardIds.length} selected{" "}
            {selectedCardIds.length === 1 ? "card" : "cards"}?
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            This removes only the selected rows. The deletion is recorded in
            Audit.
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

  // ─── Body content (loading / error / empty / rows) ────────────

  let bodyContent: React.ReactNode;
  if (loading && cards.length === 0) {
    bodyContent = (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-lg h-14 w-full"
            style={{ background: "var(--surface)" }}
          />
        ))}
      </div>
    );
  } else if (error && cards.length === 0) {
    bodyContent = (
      <div
        className="rounded-xl p-4 text-sm"
        style={{
          background: "rgb(220 38 38 / 0.08)",
          borderLeft: "3px solid rgb(220 38 38)",
          color: "var(--ink)",
        }}
      >
        Failed to load inventory. Try refreshing the page.
      </div>
    );
  } else if (total === 0 && !loading) {
    bodyContent = hasFilter ? (
      <div
        className="text-center py-16 rounded-2xl"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        <div
          className="text-3xl mb-1"
          style={{ color: "var(--accent)", opacity: 0.4 }}
        >
          ✦
        </div>
        <h2
          className="text-lg font-semibold"
          style={{ color: "var(--ink)", fontFamily: "var(--font-display)" }}
        >
          Nothing matches.
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Try a different search term or reset the filters.
        </p>
        <button
          type="button"
          onClick={resetFilters}
          className="mt-4 inline-block text-sm font-semibold underline-offset-2 hover:underline"
          style={{ color: "var(--accent)" }}
        >
          Reset filters
        </button>
      </div>
    ) : (
      <div
        className="text-center py-20 rounded-2xl"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        <div
          className="text-5xl mb-2"
          style={{ color: "var(--accent)", opacity: 0.5 }}
        >
          ✦
        </div>
        <h2
          className="text-xl font-semibold"
          style={{ color: "var(--ink)", fontFamily: "var(--font-display)" }}
        >
          The shelves are empty.
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Import a Manabox CSV to seed the storefront.
        </p>
        <a
          href="/admin/import"
          className="mt-5 inline-block rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
          style={{
            background: "var(--accent)",
            color: "var(--accent-fg)",
          }}
        >
          Import CSV →
        </a>
      </div>
    );
  } else {
    bodyContent = (
      <>
        {/* Select-all / count strip — sits above the row list */}
        <div
          className="flex items-center gap-3 px-3 sm:px-4 py-2 rounded-t-2xl"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderBottom: "none",
          }}
        >
          <SelectAllCheckbox
            checked={allCurrentPageSelected}
            indeterminate={someCurrentPageSelected}
            disabled={cards.length === 0}
            onChange={toggleCurrentPageSelection}
          />
          <span
            className="text-[11px] uppercase tracking-wider font-semibold"
            style={{ color: "var(--muted)" }}
          >
            Select page
          </span>
          <span
            className="ml-auto text-[11px] tabular-nums"
            style={{ color: "var(--muted)" }}
          >
            Page {page} · {cards.length} of {total.toLocaleString()}
          </span>
        </div>
        <ul
          role="list"
          className="overflow-hidden"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderTop: "none",
            borderBottomLeftRadius: "1rem",
            borderBottomRightRadius: "1rem",
          }}
        >
          {cards.map((card) => {
            if (deletingId === card.id) {
              return (
                <li
                  key={card.id}
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <DeleteConfirmation
                    cardName={card.name}
                    onConfirm={() => handleDelete(card.id)}
                    onCancel={() => setDeletingId(null)}
                  />
                </li>
              );
            }
            return (
              <InventoryRowCard
                key={card.id}
                card={card}
                selected={selectedCardIdSet.has(card.id)}
                density={density}
                onSelect={toggleCardSelection}
                onRequestDelete={setDeletingId}
                onInspect={setInspectingCard}
                onSave={handleSave}
                onError={(msg) => {
                  setToastVariant("error");
                  setToastMessage(msg);
                }}
              />
            );
          })}
        </ul>

        {totalPages > 1 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={50}
            onPageChange={setPage}
          />
        )}
      </>
    );
  }

  // ─── Render ───────────────────────────────────────────────────

  return (
    <>
      <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8">
        <FilterRail
          binderFilter={binderFilter}
          onBinderFilterChange={setBinderFilter}
          availableBinders={availableBinders}
          setFilter={setFilter}
          onSetFilterChange={setSetFilter}
          availableSets={availableSets}
          conditionFilter={conditionFilter}
          onConditionFilterChange={setConditionFilter}
          sort={sort}
          onSortChange={setSort}
          onReset={resetFilters}
          hasActiveFilter={hasFilter}
          totalUniverse={inventoryTotal}
        />

        <section className="min-w-0 mt-6 lg:mt-0">
          <ActionBar
            search={search}
            onSearchChange={setSearch}
            density={density}
            onDensityChange={setDensity}
            exporting={exporting}
            onExport={handleExport}
            displayedCount={total}
            inventoryTotal={inventoryTotal}
            hasFilter={hasFilter}
          />

          <div className="mt-3">
            {deleteSelectedConfirmation}
            {bodyContent}
          </div>
        </section>
      </div>

      <InventoryDangerZone
        inventoryTotal={inventoryTotal}
        onDeleteAll={handleDeleteAll}
      />

      <SelectionDock
        count={selectedCardIds.length}
        deleting={deletingSelected}
        exporting={exporting}
        onRequestDelete={() => setConfirmingDeleteSelected(true)}
        onExport={handleExport}
        onClear={() => setSelectedCardIds([])}
      />

      <InventoryLightbox
        card={inspectingCard}
        onClose={() => setInspectingCard(null)}
      />

      {toastElement}
    </>
  );
}
