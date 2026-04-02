"use client";

import { useFilterStore, type SortOption } from "@/lib/store/filter-store";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "price-desc", label: "Price: High-Low" },
  { value: "price-asc", label: "Price: Low-High" },
  { value: "name-asc", label: "Name: A-Z" },
];

export default function SortDropdown() {
  const sortBy = useFilterStore((s) => s.sortBy);
  const setSortBy = useFilterStore((s) => s.setSortBy);

  return (
    <select
      value={sortBy}
      onChange={(e) => setSortBy(e.target.value as SortOption)}
      className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1.5 text-sm cursor-pointer"
    >
      {SORT_OPTIONS.map(({ value, label }) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
