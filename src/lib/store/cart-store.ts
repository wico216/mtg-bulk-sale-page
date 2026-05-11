import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface CartState {
  /** Card ID to quantity mapping */
  items: Map<string, number>;

  /**
   * v1.3 Phase 20 D-12/D-13 — persisted cart-schema version sentinel.
   * Initial / steady state is "1.3". Pre-v1.3 carts in production have
   * `version === undefined` because the field wasn't shipped before; the
   * `needsCartMigration` predicate flags those as needing the one-time
   * v1.2 → v1.3 reconciliation pipeline (see cart-page-client.tsx).
   * String compare suffices because '1.3' is the first sentinel ever
   * shipped — any future bump (e.g., '1.4') is naturally `> '1.3'`.
   */
  version: string;

  // Actions
  addItem: (cardId: string, maxStock?: number) => void;
  removeItem: (cardId: string) => void;
  setQuantity: (cardId: string, qty: number, maxStock?: number) => void;
  clearCart: () => void;

  // Derived
  totalItems: () => number;
  hasItem: (cardId: string) => boolean;
  getQuantity: (cardId: string) => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: new Map<string, number>(),
      version: "1.3",

      addItem: (cardId, maxStock) =>
        set((state) => {
          const next = new Map(state.items);
          const current = next.get(cardId) ?? 0;
          const desired = current + 1;
          next.set(cardId, maxStock != null ? Math.min(desired, maxStock) : desired);
          return { items: next };
        }),

      removeItem: (cardId) =>
        set((state) => {
          const next = new Map(state.items);
          next.delete(cardId);
          return { items: next };
        }),

      setQuantity: (cardId, qty, maxStock) =>
        set((state) => {
          const next = new Map(state.items);
          if (qty <= 0) {
            next.delete(cardId);
          } else {
            next.set(cardId, maxStock != null ? Math.min(qty, maxStock) : qty);
          }
          return { items: next };
        }),

      clearCart: () => set({ items: new Map() }),

      totalItems: () => {
        let sum = 0;
        for (const v of get().items.values()) {
          sum += v;
        }
        return sum;
      },

      hasItem: (cardId) => get().items.has(cardId),

      getQuantity: (cardId) => get().items.get(cardId) ?? 0,
    }),
    {
      name: "viki-cart",
      storage: createJSONStorage(() => localStorage, {
        replacer: (_key: string, value: unknown) => {
          if (value instanceof Map) {
            return { __type: "Map", entries: [...value] };
          }
          return value;
        },
        reviver: (_key: string, value: unknown) => {
          if (
            value != null &&
            typeof value === "object" &&
            (value as Record<string, unknown>).__type === "Map"
          ) {
            return new Map(
              (value as { entries: [string, number][] }).entries,
            );
          }
          return value;
        },
      }),
      // v1.3 Phase 20 D-13: persist the version sentinel alongside items
      // so `needsCartMigration` can read it on next load to decide whether
      // to fire the one-time migration toast.
      partialize: (state) => ({ items: state.items, version: state.version }),
    },
  ),
);

/**
 * v1.3 Phase 20 D-13 — advance the cart-version sentinel to '1.3'.
 * Called by cart-page-client.tsx after the v1.2 → v1.3 reconciliation
 * effect completes so the one-time migration toast fires exactly once.
 * Idempotent: safe to call multiple times.
 */
export function markCartMigrated(): void {
  useCartStore.setState({ version: "1.3" });
}

/**
 * v1.3 Phase 20 D-13 — returns true iff the cart was persisted under a
 * pre-v1.3 schema (version missing or string < '1.3'). String compare
 * suffices because '1.3' is the first sentinel ever shipped; every
 * pre-v1.3 cart in production has `version === undefined`.
 */
export function needsCartMigration(state: Pick<CartState, "version">): boolean {
  return state.version == null || state.version < "1.3";
}
