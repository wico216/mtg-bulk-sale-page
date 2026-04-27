import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { OrderData, OrderItem } from "@/lib/types";

export interface CheckoutLineInput {
  cardId: string;
  quantity: number;
}

export interface StockConflict {
  cardId: string;
  name: string;
  requested: number;
  available: number;
}

export type PlaceCheckoutOrderResult =
  | { ok: true; order: OrderData }
  | { ok: false; code: "stock_conflict"; conflicts: StockConflict[] };

interface PersistedOrderItem {
  cardId: string;
  name: string;
  setName: string;
  setCode: string;
  collectorNumber: string;
  condition: string;
  price: number | null;
  quantity: number;
  lineTotal: number | null;
  imageUrl: string | null;
}

interface PersistedOrder {
  orderRef: string;
  buyerName: string;
  buyerEmail: string;
  message?: string | null;
  totalItems: number;
  totalPrice: number;
  createdAt: string | Date;
  items: PersistedOrderItem[];
}

interface CheckoutSqlPayload {
  ok: boolean;
  order?: PersistedOrder | null;
  conflicts?: StockConflict[] | null;
}

function centsToDollars(cents: number | null): number | null {
  return cents === null ? null : cents / 100;
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeOrder(order: PersistedOrder): OrderData {
  const items: OrderItem[] = order.items.map((item) => ({
    cardId: item.cardId,
    name: item.name,
    setName: item.setName,
    setCode: item.setCode,
    collectorNumber: item.collectorNumber,
    condition: item.condition,
    price: centsToDollars(item.price),
    quantity: item.quantity,
    lineTotal: centsToDollars(item.lineTotal),
    imageUrl: item.imageUrl,
  }));

  return {
    orderRef: order.orderRef,
    buyerName: order.buyerName,
    buyerEmail: order.buyerEmail,
    message: order.message ?? undefined,
    items,
    totalItems: order.totalItems,
    totalPrice: order.totalPrice / 100,
    createdAt: toIsoString(order.createdAt),
  };
}

function aggregateCheckoutLines(items: CheckoutLineInput[]): CheckoutLineInput[] {
  const quantitiesByCardId = new Map<string, number>();

  for (const item of items) {
    if (!item.cardId || typeof item.cardId !== "string") {
      throw new Error("Invalid card id");
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error(`Invalid quantity for ${item.cardId}`);
    }
    quantitiesByCardId.set(
      item.cardId,
      (quantitiesByCardId.get(item.cardId) ?? 0) + item.quantity,
    );
  }

  return [...quantitiesByCardId.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([cardId, quantity]) => ({ cardId, quantity }));
}

function parseSqlPayload(raw: unknown): CheckoutSqlPayload {
  if (typeof raw === "string") return JSON.parse(raw) as CheckoutSqlPayload;
  if (raw && typeof raw === "object") return raw as CheckoutSqlPayload;
  throw new Error("Checkout write returned no result");
}

export async function placeCheckoutOrder(input: {
  orderRef: string;
  buyerName: string;
  buyerEmail: string;
  message?: string;
  items: CheckoutLineInput[];
}): Promise<PlaceCheckoutOrderResult> {
  const requested = aggregateCheckoutLines(input.items);
  if (requested.length === 0) {
    throw new Error("Checkout requires at least one item");
  }

  const requestedValues = sql.join(
    requested.map(
      (item) => sql`(${item.cardId}::text, ${item.quantity}::integer)`,
    ),
    sql`, `,
  );

  const result = await db.execute<{ result: unknown }>(sql`
    WITH requested(card_id, requested_qty) AS (
      VALUES ${requestedValues}
    ),
    requested_agg AS (
      SELECT card_id, SUM(requested_qty)::integer AS requested_qty
      FROM requested
      GROUP BY card_id
    ),
    locked_cards AS (
      SELECT cards.*
      FROM cards
      INNER JOIN requested_agg ON requested_agg.card_id = cards.id
      ORDER BY cards.id
      FOR UPDATE
    ),
    conflicts AS (
      SELECT
        requested_agg.card_id,
        COALESCE(locked_cards.name, requested_agg.card_id) AS name,
        requested_agg.requested_qty AS requested,
        COALESCE(locked_cards.quantity, 0) AS available
      FROM requested_agg
      LEFT JOIN locked_cards ON locked_cards.id = requested_agg.card_id
      WHERE locked_cards.id IS NULL
         OR locked_cards.quantity < requested_agg.requested_qty
    ),
    can_fulfill AS (
      SELECT NOT EXISTS (SELECT 1 FROM conflicts) AS ok
    ),
    stock_write AS (
      UPDATE cards
      SET
        quantity = cards.quantity - requested_agg.requested_qty,
        updated_at = now()
      FROM requested_agg, can_fulfill
      WHERE can_fulfill.ok
        AND cards.id = requested_agg.card_id
      RETURNING cards.id
    ),
    write_check AS (
      SELECT
        (SELECT ok FROM can_fulfill)
        AND (SELECT COUNT(*) FROM stock_write) = (SELECT COUNT(*) FROM requested_agg)
        AS ok
    ),
    order_totals AS (
      SELECT
        SUM(requested_agg.requested_qty)::integer AS total_items,
        COALESCE(SUM(COALESCE(locked_cards.price, 0) * requested_agg.requested_qty), 0)::integer AS total_price
      FROM requested_agg
      INNER JOIN locked_cards ON locked_cards.id = requested_agg.card_id
    ),
    inserted_order AS (
      INSERT INTO orders (
        id,
        buyer_name,
        buyer_email,
        message,
        total_items,
        total_price,
        status
      )
      SELECT
        ${input.orderRef},
        ${input.buyerName},
        ${input.buyerEmail},
        ${input.message ?? null},
        order_totals.total_items,
        order_totals.total_price,
        'pending'::order_status
      FROM order_totals, write_check
      WHERE write_check.ok
      RETURNING id, buyer_name, buyer_email, message, total_items, total_price, status, created_at
    ),
    inserted_items AS (
      INSERT INTO order_items (
        order_id,
        card_id,
        name,
        set_name,
        set_code,
        collector_number,
        condition,
        price,
        quantity,
        line_total,
        image_url
      )
      SELECT
        inserted_order.id,
        locked_cards.id,
        locked_cards.name,
        locked_cards.set_name,
        locked_cards.set_code,
        locked_cards.collector_number,
        locked_cards.condition,
        locked_cards.price,
        requested_agg.requested_qty,
        CASE
          WHEN locked_cards.price IS NULL THEN NULL
          ELSE locked_cards.price * requested_agg.requested_qty
        END,
        locked_cards.image_url
      FROM inserted_order
      INNER JOIN requested_agg ON TRUE
      INNER JOIN locked_cards ON locked_cards.id = requested_agg.card_id
      RETURNING id, card_id, name, set_name, set_code, collector_number, condition, price, quantity, line_total, image_url
    )
    SELECT jsonb_build_object(
      'ok', (SELECT ok FROM write_check),
      'conflicts', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'cardId', conflicts.card_id,
          'name', conflicts.name,
          'requested', conflicts.requested,
          'available', conflicts.available
        ) ORDER BY conflicts.card_id)
        FROM conflicts
      ), '[]'::jsonb),
      'order', (
        SELECT jsonb_build_object(
          'orderRef', inserted_order.id,
          'buyerName', inserted_order.buyer_name,
          'buyerEmail', inserted_order.buyer_email,
          'message', inserted_order.message,
          'totalItems', inserted_order.total_items,
          'totalPrice', inserted_order.total_price,
          'createdAt', inserted_order.created_at,
          'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'cardId', inserted_items.card_id,
              'name', inserted_items.name,
              'setName', inserted_items.set_name,
              'setCode', inserted_items.set_code,
              'collectorNumber', inserted_items.collector_number,
              'condition', inserted_items.condition,
              'price', inserted_items.price,
              'quantity', inserted_items.quantity,
              'lineTotal', inserted_items.line_total,
              'imageUrl', inserted_items.image_url
            ) ORDER BY inserted_items.id)
            FROM inserted_items
          ), '[]'::jsonb)
        )
        FROM inserted_order
      )
    ) AS result;
  `);

  const payload = parseSqlPayload(result.rows[0]?.result);
  if (!payload.ok) {
    return {
      ok: false,
      code: "stock_conflict",
      conflicts: payload.conflicts ?? [],
    };
  }

  if (!payload.order) {
    throw new Error("Checkout write succeeded without returning an order");
  }

  return { ok: true, order: normalizeOrder(payload.order) };
}
