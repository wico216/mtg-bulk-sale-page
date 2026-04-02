"use client";

import { useState } from "react";

interface MultiSelectProps {
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  formatOption?: (value: string) => string;
}

export default function MultiSelect({
  label,
  options,
  selected,
  onToggle,
  formatOption,
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1.5 text-sm cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900"
      >
        {label}
        {selected.size > 0 && (
          <span className="ml-1 text-accent">({selected.size})</span>
        )}
      </button>

      {isOpen && (
        <>
          {/* Invisible backdrop to close on outside click */}
          <div
            className="fixed inset-0 z-20"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown panel */}
          <div className="absolute top-full mt-1 z-30 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg min-w-[200px] max-h-60 overflow-y-auto">
            {options.map((option) => (
              <label
                key={option}
                className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.has(option)}
                  onChange={() => onToggle(option)}
                />
                {formatOption ? formatOption(option) : option}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
