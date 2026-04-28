import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { createAdminAuditEntry, type AdminMutationAuditContext } from "@/db/queries";
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

function parseCancelOrderPayload(raw: unknown): CancelOrderPayload {
  const payload =
    typeof raw === "string"
      ? (JSON.parse(raw) as RawCancelOrderPayload)
      : (raw as RawCancelOrderPayload | undefined);

  if (!payload || typeof payload !== "object") {
    throw new Error("Cancel order returned no result");
  }

  const skippedItems =
    typeof payload.skippedItems === "string"
      ? (JSON.parse(payload.skippedItems) as CancelSkippedItem[])
      : (payload.skippedItems ?? []);

  return {
    found: Boolean(payload.found),
    completed: Boolean(payload.completed),
    alreadyCancelled: Boolean(payload.alreadyCancelled),
    restoredQuantity: numberFromDb(payload.restoredQuantity),
    restoredRows: numberFromDb(payload.restoredRows),
    skippedItems,
  };
}

export type OrderWorkflowStatus = "pending" | "confirmed" | "completed";
export type OrderStatus = OrderWorkflowStatus | "cancelled";

export const ORDER_WORKFLOW_STATUSES: readonly OrderWorkflowStatus[] = [
  "pending",
  "confirmed",
  "completed",
];

export const ORDER_STATUSES: readonly OrderStatus[] = [
  ...ORDER_WORKFLOW_STATUSES,
  "cancelled",
];

export interface AdminOrdersParams {
  page?: number;
  limit?: number;
  q?: string;
  status?: OrderStatus | "all";
}

export interface AdminOrderSummary {
  id: string;
  buyerName: string;
  buyerEmail: string;
  totalItems: number;
  totalPrice: number;
  status: OrderStatus;
  createdAt: string;
}

export interface AdminOrdersResult {
  orders: AdminOrderSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type AdminOrderDetail = OrderData & {
  status: OrderStatus;
  adminNote?: string | null;
};

export interface UpdateOrderWorkflowInput {
  orderId: string;
  status?: OrderWorkflowStatus;
  adminNote?: string | null;
  audit?: AdminMutationAuditContext;
}

export interface CancelOrderInput {
  orderId: string;
  restoreInventory: boolean;
  audit?: AdminMutationAuditContext;
}

export interface CancelSkippedItem {
  cardId: string;
  name: string;
  quantity: number;
}

export type CancelOrderResult =
  | {
      ok: true;
      order: AdminOrderDetail;
      alreadyCancelled: boolean;
      restoredQuantity: number;
      restoredRows: number;
      skippedItems: CancelSkippedItem[];
    }
  | {
      ok: false;
      code: "not_found" | "completed_order";
      message: string;
    };

interface AdminOrderRow {
  [key: string]: unknown;
  id: string;
  buyerName: string;
  buyerEmail: string;
  message?: string | null;
  adminNote?: string | null;
  totalItems: number;
  totalPrice: number;
  status: OrderStatus | string;
  createdAt: string | Date;
}

interface AdminOrderItemRow extends PersistedOrderItem {
  [key: string]: unknown;
}

interface RawCancelOrderPayload {
  found?: boolean;
  completed?: boolean;
  alreadyCancelled?: boolean;
  restoredQuantity?: number | string | null;
  restoredRows?: number | string | null;
  skippedItems?: CancelSkippedItem[] | string | null;
}

interface CancelOrderPayload {
  found: boolean;
  completed: boolean;
  alreadyCancelled: boolean;
  restoredQuantity: number;
  restoredRows: number;
  skippedItems: CancelSkippedItem[];
}

function normalizePage(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) return 1;
  return Math.max(1, Math.trunc(value));
}

function normalizeLimit(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) return 25;
  return Math.min(100, Math.max(1, Math.trunc(value)));
}

function numberFromDb(value: number | string | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number.parseInt(value, 10);
  return 0;
}

function normalizeStatus(value: string): OrderStatus {
  if (
    value === "confirmed" ||
    value === "completed" ||
    value === "cancelled"
  ) {
    return value;
  }
  return "pending";
}

function normalizeStatusFilter(
  value: AdminOrdersParams["status"],
): OrderStatus | undefined {
  if (!value || value === "all") return undefined;
  return ORDER_STATUSES.includes(value) ? value : undefined;
}

function normalizeSearch(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function buildOrderFilters(params: AdminOrdersParams) {
  const filters = [];
  const search = normalizeSearch(params.q);
  const status = normalizeStatusFilter(params.status);

  if (search) {
    const pattern = `%${search}%`;
    filters.push(sql`(
      id ILIKE ${pattern}
      OR buyer_name ILIKE ${pattern}
      OR buyer_email ILIKE ${pattern}
    )`);
  }

  if (status) {
    filters.push(sql`status = ${status}::order_status`);
  }

  return filters.length > 0 ? sql`WHERE ${sql.join(filters, sql` AND `)}` : sql``;
}

function normalizeAdminNote(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function buildWorkflowSetClauses(input: UpdateOrderWorkflowInput) {
  const clauses = [];

  if (input.status !== undefined) {
    clauses.push(sql`status = ${input.status}::order_status`);
  }

  if ("adminNote" in input) {
    clauses.push(sql`admin_note = ${normalizeAdminNote(input.adminNote)}`);
  }

  if (clauses.length === 0) {
    throw new Error("Order workflow update requires at least one field");
  }

  return sql.join(clauses, sql`, `);
}

function normalizeAdminOrderSummary(row: AdminOrderRow): AdminOrderSummary {
  return {
    id: row.id,
    buyerName: row.buyerName,
    buyerEmail: row.buyerEmail,
    totalItems: row.totalItems,
    totalPrice: row.totalPrice / 100,
    status: normalizeStatus(row.status),
    createdAt: toIsoString(row.createdAt),
  };
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

export async function getAdminOrders(
  params: AdminOrdersParams = {},
): Promise<AdminOrdersResult> {
  const page = normalizePage(params.page);
  const limit = normalizeLimit(params.limit);
  const offset = (page - 1) * limit;
  const whereClause = buildOrderFilters(params);

  const [ordersResult, countResult] = await Promise.all([
    db.execute<AdminOrderRow>(sql`
      SELECT
        id,
        buyer_name AS "buyerName",
        buyer_email AS "buyerEmail",
        total_items AS "totalItems",
        total_price AS "totalPrice",
        status,
        created_at AS "createdAt"
      FROM orders
      ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `),
    db.execute<{ total: number | string }>(sql`
      SELECT COUNT(*)::integer AS total
      FROM orders
      ${whereClause}
    `),
  ]);

  const total = numberFromDb(countResult.rows[0]?.total);

  return {
    orders: ordersResult.rows.map(normalizeAdminOrderSummary),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getOrderById(
  id: string,
): Promise<AdminOrderDetail | null> {
  const orderResult = await db.execute<AdminOrderRow>(sql`
    SELECT
      id,
      buyer_name AS "buyerName",
      buyer_email AS "buyerEmail",
      message,
      admin_note AS "adminNote",
      total_items AS "totalItems",
      total_price AS "totalPrice",
      status,
      created_at AS "createdAt"
    FROM orders
    WHERE id = ${id}
    LIMIT 1
  `);

  const order = orderResult.rows[0];
  if (!order) return null;

  const itemsResult = await db.execute<AdminOrderItemRow>(sql`
    SELECT
      card_id AS "cardId",
      name,
      set_name AS "setName",
      set_code AS "setCode",
      collector_number AS "collectorNumber",
      condition,
      price,
      quantity,
      line_total AS "lineTotal",
      image_url AS "imageUrl"
    FROM order_items
    WHERE order_id = ${id}
    ORDER BY id ASC
  `);

  return {
    orderRef: order.id,
    buyerName: order.buyerName,
    buyerEmail: order.buyerEmail,
    message: order.message ?? undefined,
    adminNote: order.adminNote ?? null,
    totalItems: order.totalItems,
    totalPrice: order.totalPrice / 100,
    status: normalizeStatus(order.status),
    createdAt: toIsoString(order.createdAt),
    items: itemsResult.rows.map((item) => ({
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
    })),
  };
}

export async function updateOrderWorkflow(
  input: UpdateOrderWorkflowInput,
): Promise<AdminOrderDetail | null> {
  const setClauses = buildWorkflowSetClauses(input);

  const result = await db.execute<{ id: string }>(sql`
    UPDATE orders
    SET ${setClauses}
    WHERE id = ${input.orderId}
    RETURNING id
  `);

  if (!result.rows[0]) return null;

  if (input.audit) {
    await createAdminAuditEntry({
      action: "order.status_update",
      actorEmail: input.audit.actorEmail ?? null,
      targetType: "order",
      targetId: input.orderId,
      targetCount: 1,
      metadata: {
        ...(input.audit.metadata ?? {}),
        changedFields: [
          ...(input.status !== undefined ? ["status"] : []),
          ...("adminNote" in input ? ["adminNote"] : []),
        ],
        status: input.status,
        adminNoteChanged: "adminNote" in input,
      },
    });
  }

  return getOrderById(input.orderId);
}

export async function cancelOrder(
  input: CancelOrderInput,
): Promise<CancelOrderResult> {
  const result = await db.execute<{ result: unknown }>(sql`
    WITH target_order AS (
      SELECT id, status
      FROM orders
      WHERE id = ${input.orderId}
      FOR UPDATE
    ),
    cancellable_order AS (
      SELECT id
      FROM target_order
      WHERE status IN ('pending'::order_status, 'confirmed'::order_status)
    ),
    updated_order AS (
      UPDATE orders
      SET status = 'cancelled'::order_status
      WHERE id IN (SELECT id FROM cancellable_order)
      RETURNING id
    ),
    items_for_restore AS (
      SELECT
        order_items.card_id,
        order_items.name,
        order_items.quantity
      FROM order_items
      WHERE order_items.order_id = ${input.orderId}
        AND ${input.restoreInventory}
        AND EXISTS (SELECT 1 FROM updated_order)
    ),
    restored AS (
      UPDATE cards
      SET
        quantity = cards.quantity + items_for_restore.quantity,
        updated_at = now()
      FROM items_for_restore
      WHERE cards.id = items_for_restore.card_id
      RETURNING cards.id AS card_id, items_for_restore.quantity
    ),
    skipped_items AS (
      SELECT
        items_for_restore.card_id,
        items_for_restore.name,
        items_for_restore.quantity
      FROM items_for_restore
      WHERE NOT EXISTS (
        SELECT 1
        FROM restored
        WHERE restored.card_id = items_for_restore.card_id
      )
    )
    SELECT jsonb_build_object(
      'found', EXISTS (SELECT 1 FROM target_order),
      'completed', EXISTS (
        SELECT 1
        FROM target_order
        WHERE status = 'completed'::order_status
      ),
      'alreadyCancelled', EXISTS (
        SELECT 1
        FROM target_order
        WHERE status = 'cancelled'::order_status
      ),
      'restoredQuantity', COALESCE((SELECT SUM(quantity)::integer FROM restored), 0),
      'restoredRows', COALESCE((SELECT COUNT(*)::integer FROM restored), 0),
      'skippedItems', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'cardId', skipped_items.card_id,
          'name', skipped_items.name,
          'quantity', skipped_items.quantity
        ) ORDER BY skipped_items.card_id)
        FROM skipped_items
      ), '[]'::jsonb)
    ) AS result
  `);

  const payload = parseCancelOrderPayload(result.rows[0]?.result);

  if (!payload.found) {
    return { ok: false, code: "not_found", message: "Order not found" };
  }

  if (payload.completed) {
    return {
      ok: false,
      code: "completed_order",
      message: "Completed orders cannot be cancelled",
    };
  }

  const order = await getOrderById(input.orderId);
  if (!order) {
    return { ok: false, code: "not_found", message: "Order not found" };
  }

  if (input.audit && !payload.alreadyCancelled) {
    await createAdminAuditEntry({
      action: "order.cancel",
      actorEmail: input.audit.actorEmail ?? null,
      targetType: "order",
      targetId: input.orderId,
      targetCount: 1,
      metadata: {
        ...(input.audit.metadata ?? {}),
        restoreRequested: input.restoreInventory,
        restoredQuantity: payload.restoredQuantity,
        restoredRows: payload.restoredRows,
        skippedItems: payload.skippedItems,
      },
    });

    if (input.restoreInventory) {
      await createAdminAuditEntry({
        action: "order.restore_inventory",
        actorEmail: input.audit.actorEmail ?? null,
        targetType: "order",
        targetId: input.orderId,
        targetCount: payload.restoredRows,
        metadata: {
          ...(input.audit.metadata ?? {}),
          restoredQuantity: payload.restoredQuantity,
          restoredRows: payload.restoredRows,
          skippedItems: payload.skippedItems,
        },
      });
    }
  }

  return {
    ok: true,
    order,
    alreadyCancelled: payload.alreadyCancelled,
    restoredQuantity: payload.restoredQuantity,
    restoredRows: payload.restoredRows,
    skippedItems: payload.skippedItems,
  };
}
