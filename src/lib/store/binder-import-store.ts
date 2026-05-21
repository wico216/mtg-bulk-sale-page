import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Phase 23 / v1.4 D-05 — operator's binder selection memory (post-removal).
 *
 * v1.4 invariant: the import binder picker opens with every binder
 * UNCHECKED on every session, regardless of any prior `lastSelection`
 * content. The "Select all" and "Deselect all" buttons in
 * `binder-picker.tsx` are the operator's recovery affordances. The
 * earlier "remembered selection memory" getter that derived per-binder
 * initial checks from `lastSelection` is REMOVED (Plan 23-02, Shape B
 * from `.planning/phases/23-import-ux-price-refresh/23-PATTERNS.md`).
 *
 * Why `lastSelection` and `recordCommit` are still RETAINED:
 * `computeMissingBinders` at `binder-picker.tsx:33-39` consumes
 * `knownBinderNames()` (derived from `lastSelection`) to compute the
 * will-delete amber panel set rendered by `import-client.tsx` (see line
 * 250 — the `initialWillDelete` loop). Removing `lastSelection` would
 * break the v1.3 D-11 will-delete behavior, which is UNCHANGED in v1.4
 * (D-05 explicit: only the picker's per-binder memory is dropped; the
 * amber will-delete panel default-CHECKED behavior is unaffected).
 *
 * Stored under localStorage key `wikos-spellbook-binder-import-selection`
 * with version 1. Previous releases used the key `viki-binder-import-selection`
 * (renamed 2026-05-20 with the Wiko's Spellbook rebrand); the rename means any
 * in-progress import selection from before the rebrand falls back to the
 * default empty state on first read, which is harmless — Plan 23-02 (D-05)
 * already opens the picker UNCHECKED every session anyway.
 */
export interface BinderImportState {
  /** Map of normalized binder name -> last-checked state. */
  lastSelection: Record<string, boolean>;
  /** ISO 8601 timestamp of the last successful commit; null if never used. */
  lastUsedAt: string | null;

  // Actions
  setLastSelection: (selection: Record<string, boolean>) => void;
  recordCommit: (selection: Record<string, boolean>) => void;
  clearSelection: () => void;

  // Derived
  knownBinderNames: () => string[];
}

export const BINDER_IMPORT_STORAGE_KEY = "wikos-spellbook-binder-import-selection";
export const BINDER_IMPORT_STORE_VERSION = 1;

export const useBinderImportStore = create<BinderImportState>()(
  persist(
    (set, get) => ({
      lastSelection: {},
      lastUsedAt: null,

      setLastSelection: (selection) => set({ lastSelection: { ...selection } }),

      recordCommit: (selection) =>
        set({
          lastSelection: { ...selection },
          lastUsedAt: new Date().toISOString(),
        }),

      clearSelection: () => set({ lastSelection: {}, lastUsedAt: null }),

      knownBinderNames: () => Object.keys(get().lastSelection).sort(),
    }),
    {
      name: BINDER_IMPORT_STORAGE_KEY,
      version: BINDER_IMPORT_STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        lastSelection: state.lastSelection,
        lastUsedAt: state.lastUsedAt,
      }),
      // Future-proofing: when version bumps, add a migrate function here.
      // Today, version 1 is the initial shape.
    },
  ),
);
