import type { Card, CheckoutRequest, OrderData, OrderItem } from "@/lib/types";

/**
 * Replaces HTML-sensitive characters with entities.
 * Used by email templates to prevent XSS from user input (name, email, message).
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Generates a timestamp-based order reference (D-24).
 * Format: ORD-YYYYMMDD-HHMM using UTC time.
 */
export function generateOrderRef(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = now.toISOString().slice(11, 16).replace(":", "");
  return `ORD-${date}-${time}`;
}

/**
 * Builds a complete OrderData object from a checkout request and the full card list.
 * Cleanly separates order data construction from delivery (D-14).
 */
export function buildOrderData(
  request: CheckoutRequest,
  cards: Card[],
): OrderData {
  const cardMap = new Map(cards.map((c) => [c.id, c]));

  const items: OrderItem[] = request.items.map((reqItem) => {
    const card = cardMap.get(reqItem.cardId);
    const name = card?.name ?? reqItem.cardId;
    const setName = card?.setName ?? "";
    const price = card?.price ?? null;
    const lineTotal = price !== null ? price * reqItem.quantity : null;

    return {
      cardId: reqItem.cardId,
      name,
      setName,
      price,
      quantity: reqItem.quantity,
      lineTotal,
    };
  });

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce(
    (sum, item) => sum + (item.lineTotal ?? 0),
    0,
  );

  return {
    orderRef: generateOrderRef(),
    buyerName: request.buyerName,
    buyerEmail: request.buyerEmail,
    message: request.message,
    items,
    totalItems,
    totalPrice,
    createdAt: new Date().toISOString(),
  };
}
