import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface WBinderPickState {
  /** Aggregated private W-card ID to picked quantity mapping. */
  items: Map<string, number>;
  addItem: (cardId: string, maxStock?: number) => void;
  removeItem: (cardId: string) => void;
  setQuantity: (cardId: string, qty: number, maxStock?: number) => void;
  clearPickList: () => void;
  totalItems: () => number;
}

export const useWBinderPickStore = create<WBinderPickState>()(
  persist(
    (set, get) => ({
      items: new Map<string, number>(),

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

      clearPickList: () => set({ items: new Map<string, number>() }),

      totalItems: () => {
        let total = 0;
        for (const qty of get().items.values()) total += qty;
        return total;
      },
    }),
    {
      name: "wikos-spellbook-admin-w-pick-list",
      storage: createJSONStorage(() => localStorage, {
        replacer: (_key: string, value: unknown) => {
          if (value instanceof Map) return { __type: "Map", entries: [...value] };
          return value;
        },
        reviver: (_key: string, value: unknown) => {
          if (
            value != null &&
            typeof value === "object" &&
            (value as Record<string, unknown>).__type === "Map"
          ) {
            return new Map((value as { entries: [string, number][] }).entries);
          }
          return value;
        },
      }),
      partialize: (state) => ({ items: state.items }),
    },
  ),
);
