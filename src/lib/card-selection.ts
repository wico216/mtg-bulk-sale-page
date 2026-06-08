export interface CardSelectionController {
  /** Card ID to selected quantity mapping. */
  items: Map<string, number>;
  addItem: (cardId: string, maxStock?: number) => void;
  setQuantity: (cardId: string, qty: number, maxStock?: number) => void;
  removeItem: (cardId: string) => void;
  copy?: {
    addLabel?: string;
    quickAddLabel?: string;
    selectedBadgeLabel?: string;
    reviewHref?: string;
    reviewLabel?: string;
    chooseOptionsLabel?: string;
    quantityAvailableLabel?: string;
  };
}
