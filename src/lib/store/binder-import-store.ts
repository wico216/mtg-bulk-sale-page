import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Phase 19 D-09 / D-10 — operator's binder selection memory.
 *
 * Mirrors the cart-store.ts persist pattern but JSON-native (no Map
 * serialization needed for `Record<string, boolean>`).
 *
 * Stored under localStorage key `viki-binder-import-selection` with version 1.
 * The `version` + future `migrate` hooks let us evolve the shape without
 * orphaning existing operators' preferences.
 *
 * D-08: `unsorted` is FORCED to default-UNCHECKED on every render regardless
 * of `lastSelection` content (the operator must opt in each time so a
 * mass-delete of "unsorted" rows is a deliberate act).
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
  defaultCheckedFor: (binder: { name: string; isNew: boolean }) => boolean;
  knownBinderNames: () => string[];
}

export const BINDER_IMPORT_STORAGE_KEY = "viki-binder-import-selection";
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

      defaultCheckedFor: ({ name, isNew }) => {
        // D-08: unsorted always defaults UNCHECKED, regardless of lastSelection.
        if (name === "unsorted") return false;
        const prior = get().lastSelection[name];
        return prior ?? isNew;
      },

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
