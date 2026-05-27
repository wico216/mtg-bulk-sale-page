import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { AdminMutationAuditContext } from "@/db/queries";
import type { Finish } from "@/lib/types";

export type ManaBoxRemovalStatus = "pending" | "confirmed" | "completed";
export type ManaBoxRemovalFinish = Finish | "unknown";

interface ManaBoxLineItemRow {
  [key: string]: unknown;
  orderItemId: number | string;
  orderRef: string;
  status: ManaBoxRemovalStatus | string;
  soldAt: string | Date;
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
  binder: string;
}

export interface ManaBoxRemovalBoxBreakdown {
  box: string;
  quantity: number;
  orderRefs: string[];
  orderItemIds: number[];
}

export interface ManaBoxRemovalReportRow {
  key: string;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  finish: ManaBoxRemovalFinish;
  condition: string;
  quantity: number;
  totalValue: number;
  orderRefs: string[];
  orderItemIds: number[];
  binders: string[];
  boxBreakdown: ManaBoxRemovalBoxBreakdown[];
  statuses: ManaBoxRemovalStatus[];
  firstSoldAt: string;
  lastSoldAt: string;
  imageUrl: string | null;
}

export interface ManaBoxRemovalReport {
  generatedAt: string;
  rows: ManaBoxRemovalReportRow[];
  totalRows: number;
  totalQuantity: number;
  totalValue: number;
  orderCount: number;
  lastMarkedAt: string | null;
  lastMarkedBy: string | null;
}

export interface MarkManaBoxItemsRemovedInput {
  orderItemIds: readonly number[];
  audit?: AdminMutationAuditContext;
}

export interface MarkManaBoxItemsRemovedResult {
  requestedItemIds: number[];
  markedItemIds: number[];
  skippedItemIds: number[];
  markedRows: number;
  markedQuantity: number;
  markedAt: string | null;
}

interface MarkPayload {
  requestedItemIds?: Array<number | string> | string | null;
  markedItemIds?: Array<number | string> | string | null;
  skippedItemIds?: Array<number | string> | string | null;
  markedQuantity?: number | string | null;
  markedAt?: string | Date | null;
}

const FINISH_VALUES: readonly Finish[] = ["normal", "foil", "etched"];
const FINISH_SET = new Set<string>(FINISH_VALUES);
const STATUS_ORDER: readonly ManaBoxRemovalStatus[] = ["pending", "confirmed", "completed"];
const MAX_MARK_IDS = 500;

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function numberFromDb(value: number | string | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number.parseInt(value, 10);
  return 0;
}

function centsToDollars(cents: number): number {
  return cents / 100;
}

function normalizeStatus(value: string): ManaBoxRemovalStatus {
  return STATUS_ORDER.includes(value as ManaBoxRemovalStatus)
    ? (value as ManaBoxRemovalStatus)
    : "pending";
}

function normalizeOrderItemIds(ids: readonly number[]): number[] {
  const normalized = ids
    .filter((id) => Number.isInteger(id) && id > 0)
    .map((id) => Math.trunc(id));
  return [...new Set(normalized)].slice(0, MAX_MARK_IDS);
}

function deriveFinish(row: ManaBoxLineItemRow): ManaBoxRemovalFinish {
  const prefix = `${row.setCode}-${row.collectorNumber}-`;
  const suffix = `-${row.condition}-${row.binder}`;
  if (row.cardId.startsWith(prefix) && row.cardId.endsWith(suffix)) {
    const middle = row.cardId.slice(prefix.length, row.cardId.length - suffix.length);
    if (FINISH_SET.has(middle)) return middle as Finish;
  }

  // Defensive fallback for legacy/malformed snapshots. This should not fire for
  // current checkout rows, but it keeps the report usable if an old order_item
  // card_id has a shape we no longer generate.
  const finish = row.cardId.split("-").find((segment) => FINISH_SET.has(segment));
  return finish ? (finish as Finish) : "unknown";
}

function lineValueCents(row: ManaBoxLineItemRow): number {
  if (row.lineTotal !== null && row.lineTotal !== undefined) return numberFromDb(row.lineTotal);
  const price = numberFromDb(row.price);
  return price * numberFromDb(row.quantity);
}

function makeRowKey(row: ManaBoxLineItemRow, finish: ManaBoxRemovalFinish): string {
  return [row.setCode, row.collectorNumber, finish, row.condition].join("|");
}

function sortedStatusList(statuses: Set<ManaBoxRemovalStatus>): ManaBoxRemovalStatus[] {
  return [...statuses].sort((left, right) => left.localeCompare(right));
}

function sortedList(values: Set<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

type ManaBoxRemovalRowGroup = {
  row: ManaBoxRemovalReportRow;
  orderRefs: Set<string>;
  binders: Set<string>;
  statuses: Set<ManaBoxRemovalStatus>;
  totalValueCents: number;
  boxes: Map<
    string,
    {
      quantity: number;
      orderRefs: Set<string>;
      orderItemIds: number[];
    }
  >;
};

function addBoxBreakdown(
  group: ManaBoxRemovalRowGroup,
  rawRow: ManaBoxLineItemRow,
  orderItemId: number,
  quantity: number,
) {
  const current = group.boxes.get(rawRow.binder);
  if (current) {
    current.quantity += quantity;
    current.orderRefs.add(rawRow.orderRef);
    current.orderItemIds.push(orderItemId);
    return;
  }

  group.boxes.set(rawRow.binder, {
    quantity,
    orderRefs: new Set([rawRow.orderRef]),
    orderItemIds: [orderItemId],
  });
}

function normalizeReportRows(lineItems: ManaBoxLineItemRow[]): ManaBoxRemovalReportRow[] {
  const groups = new Map<string, ManaBoxRemovalRowGroup>();

  for (const rawRow of lineItems) {
    const orderItemId = numberFromDb(rawRow.orderItemId);
    const quantity = numberFromDb(rawRow.quantity);
    const finish = deriveFinish(rawRow);
    const key = makeRowKey(rawRow, finish);
    const soldAt = toIsoString(rawRow.soldAt);
    const status = normalizeStatus(String(rawRow.status));
    const valueCents = lineValueCents(rawRow);

    const current = groups.get(key);
    if (!current) {
      const group: ManaBoxRemovalRowGroup = {
        row: {
          key,
          name: rawRow.name,
          setCode: rawRow.setCode,
          setName: rawRow.setName,
          collectorNumber: rawRow.collectorNumber,
          finish,
          condition: rawRow.condition,
          quantity,
          totalValue: centsToDollars(valueCents),
          orderRefs: [rawRow.orderRef],
          orderItemIds: [orderItemId],
          binders: [rawRow.binder],
          boxBreakdown: [],
          statuses: [status],
          firstSoldAt: soldAt,
          lastSoldAt: soldAt,
          imageUrl: rawRow.imageUrl ?? null,
        },
        orderRefs: new Set([rawRow.orderRef]),
        binders: new Set([rawRow.binder]),
        statuses: new Set([status]),
        totalValueCents: valueCents,
        boxes: new Map(),
      };
      addBoxBreakdown(group, rawRow, orderItemId, quantity);
      groups.set(key, group);
      continue;
    }

    current.row.quantity += quantity;
    current.row.orderItemIds.push(orderItemId);
    current.orderRefs.add(rawRow.orderRef);
    current.binders.add(rawRow.binder);
    current.statuses.add(status);
    current.totalValueCents += valueCents;
    current.row.totalValue = centsToDollars(current.totalValueCents);
    if (!current.row.imageUrl && rawRow.imageUrl) {
      current.row.imageUrl = rawRow.imageUrl;
    }
    if (new Date(soldAt).getTime() < new Date(current.row.firstSoldAt).getTime()) {
      current.row.firstSoldAt = soldAt;
    }
    if (new Date(soldAt).getTime() > new Date(current.row.lastSoldAt).getTime()) {
      current.row.lastSoldAt = soldAt;
    }
    addBoxBreakdown(current, rawRow, orderItemId, quantity);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group.row,
      orderRefs: sortedList(group.orderRefs),
      orderItemIds: [...group.row.orderItemIds].sort((left, right) => left - right),
      binders: sortedList(group.binders),
      boxBreakdown: [...group.boxes.entries()]
        .map(([box, value]) => ({
          box,
          quantity: value.quantity,
          orderRefs: sortedList(value.orderRefs),
          orderItemIds: [...value.orderItemIds].sort((left, right) => left - right),
        }))
        .sort((left, right) => left.box.localeCompare(right.box)),
      statuses: sortedStatusList(group.statuses),
    }))
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.setCode.localeCompare(right.setCode) ||
        left.collectorNumber.localeCompare(right.collectorNumber) ||
        left.finish.localeCompare(right.finish) ||
        left.condition.localeCompare(right.condition),
    );
}

function parseIdArray(value: MarkPayload["requestedItemIds"]): number[] {
  const raw = typeof value === "string" ? JSON.parse(value) as unknown : value;
  if (!Array.isArray(raw)) return [];
  return raw.map((id) => numberFromDb(id));
}

function parseMarkPayload(raw: unknown): MarkPayload {
  if (typeof raw === "string") return JSON.parse(raw) as MarkPayload;
  if (raw && typeof raw === "object") return raw as MarkPayload;
  throw new Error("ManaBox mark query returned no result");
}

export async function getManaBoxRemovalReport(): Promise<ManaBoxRemovalReport> {
  const [lineItemsResult, lastMarkedResult] = await Promise.all([
    db.execute<ManaBoxLineItemRow>(sql`
      SELECT
        order_items.id::integer AS "orderItemId",
        order_items.order_id AS "orderRef",
        orders.status,
        orders.created_at AS "soldAt",
        order_items.card_id AS "cardId",
        order_items.name,
        order_items.set_name AS "setName",
        order_items.set_code AS "setCode",
        order_items.collector_number AS "collectorNumber",
        order_items.condition,
        order_items.price,
        order_items.quantity,
        order_items.line_total AS "lineTotal",
        order_items.image_url AS "imageUrl",
        order_items.binder
      FROM order_items
      INNER JOIN orders ON orders.id = order_items.order_id
      WHERE orders.status <> 'cancelled'
        AND NOT EXISTS (
          SELECT 1
          FROM admin_audit_log
          WHERE admin_audit_log.action = 'manabox.removal_marked'
            AND admin_audit_log.target_type = 'order_item'
            AND admin_audit_log.target_id = order_items.id::text
        )
      ORDER BY orders.created_at ASC, order_items.id ASC
    `),
    db.execute<{ lastMarkedAt: string | Date | null; lastMarkedBy: string | null }>(sql`
      SELECT
        MAX(created_at) AS "lastMarkedAt",
        (ARRAY_AGG(actor_email ORDER BY created_at DESC, id DESC))[1] AS "lastMarkedBy"
      FROM admin_audit_log
      WHERE action = 'manabox.removal_marked'
        AND target_type = 'order_item'
    `),
  ]);

  const rows = normalizeReportRows(lineItemsResult.rows);
  const orderRefs = new Set<string>();
  let totalQuantity = 0;
  let totalValue = 0;
  for (const row of rows) {
    totalQuantity += row.quantity;
    totalValue += row.totalValue;
    for (const orderRef of row.orderRefs) orderRefs.add(orderRef);
  }

  const lastMarked = lastMarkedResult.rows[0];

  return {
    generatedAt: new Date().toISOString(),
    rows,
    totalRows: rows.length,
    totalQuantity,
    totalValue: Number(totalValue.toFixed(2)),
    orderCount: orderRefs.size,
    lastMarkedAt: lastMarked?.lastMarkedAt ? toIsoString(lastMarked.lastMarkedAt) : null,
    lastMarkedBy: lastMarked?.lastMarkedBy ?? null,
  };
}

export async function markManaBoxItemsRemoved(
  input: MarkManaBoxItemsRemovedInput,
): Promise<MarkManaBoxItemsRemovedResult> {
  const requestedIds = normalizeOrderItemIds(input.orderItemIds);
  if (requestedIds.length === 0) {
    throw new Error("ManaBox removal mark requires at least one order item id");
  }

  const requestedValues = sql.join(
    requestedIds.map((id) => sql`(${id}::integer)`),
    sql`, `,
  );
  const actorEmail = input.audit?.actorEmail ?? null;

  const result = await db.execute<{ result: unknown }>(sql`
    WITH requested(order_item_id) AS (
      VALUES ${requestedValues}
    ),
    candidate_items AS (
      SELECT
        order_items.id::integer AS order_item_id,
        order_items.order_id,
        order_items.card_id,
        order_items.name,
        order_items.set_code,
        order_items.collector_number,
        order_items.condition,
        order_items.quantity,
        order_items.binder,
        orders.status,
        orders.created_at AS sold_at
      FROM requested
      INNER JOIN order_items ON order_items.id = requested.order_item_id
      INNER JOIN orders ON orders.id = order_items.order_id
      WHERE orders.status <> 'cancelled'
        AND NOT EXISTS (
          SELECT 1
          FROM admin_audit_log
          WHERE admin_audit_log.action = 'manabox.removal_marked'
            AND admin_audit_log.target_type = 'order_item'
            AND admin_audit_log.target_id = order_items.id::text
        )
    ),
    inserted AS (
      INSERT INTO admin_audit_log (
        action,
        actor_email,
        target_type,
        target_id,
        target_count,
        metadata
      )
      SELECT
        'manabox.removal_marked',
        ${actorEmail},
        'order_item',
        candidate_items.order_item_id::text,
        candidate_items.quantity,
        jsonb_build_object(
          'source', 'manabox-removal-report',
          'orderRef', candidate_items.order_id,
          'cardId', candidate_items.card_id,
          'cardName', candidate_items.name,
          'setCode', candidate_items.set_code,
          'collectorNumber', candidate_items.collector_number,
          'condition', candidate_items.condition,
          'quantity', candidate_items.quantity,
          'binder', candidate_items.binder,
          'orderStatus', candidate_items.status,
          'soldAt', candidate_items.sold_at
        )
      FROM candidate_items
      WHERE NOT EXISTS (
        SELECT 1
        FROM admin_audit_log
        WHERE admin_audit_log.action = 'manabox.removal_marked'
          AND admin_audit_log.target_type = 'order_item'
          AND admin_audit_log.target_id = candidate_items.order_item_id::text
      )
      RETURNING target_id::integer AS order_item_id, target_count, created_at
    )
    SELECT jsonb_build_object(
      'requestedItemIds', COALESCE((
        SELECT jsonb_agg(requested.order_item_id ORDER BY requested.order_item_id)
        FROM requested
      ), '[]'::jsonb),
      'markedItemIds', COALESCE((
        SELECT jsonb_agg(inserted.order_item_id ORDER BY inserted.order_item_id)
        FROM inserted
      ), '[]'::jsonb),
      'skippedItemIds', COALESCE((
        SELECT jsonb_agg(requested.order_item_id ORDER BY requested.order_item_id)
        FROM requested
        WHERE NOT EXISTS (
          SELECT 1 FROM inserted WHERE inserted.order_item_id = requested.order_item_id
        )
      ), '[]'::jsonb),
      'markedQuantity', COALESCE((SELECT SUM(target_count)::integer FROM inserted), 0),
      'markedAt', (SELECT MAX(created_at) FROM inserted)
    ) AS result
  `);

  const payload = parseMarkPayload(result.rows[0]?.result);
  const markedItemIds = parseIdArray(payload.markedItemIds);

  return {
    requestedItemIds: parseIdArray(payload.requestedItemIds),
    markedItemIds,
    skippedItemIds: parseIdArray(payload.skippedItemIds),
    markedRows: markedItemIds.length,
    markedQuantity: numberFromDb(payload.markedQuantity),
    markedAt: payload.markedAt ? toIsoString(payload.markedAt) : null,
  };
}
