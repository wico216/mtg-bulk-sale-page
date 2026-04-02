import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface CartState {
  /** Card ID to quantity mapping */
  items: Map<string, number>;

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
      partialize: (state) => ({ items: state.items }),
    },
  ),
);
