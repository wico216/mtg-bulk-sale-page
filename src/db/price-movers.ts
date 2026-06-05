import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { Finish } from "@/lib/types";

export interface PriceMoverReportRow {
  cardId: string;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  finish: Finish;
  condition: string;
  binder: string;
  quantity: number;
  imageUrl: string | null;
  previousPrice: number;
  currentPrice: number;
  dollarGain: number;
  percentGain: number | null;
  inventoryGain: number;
  lastMovedAt: string;
}

export interface PriceMoversReport {
  generatedAt: string;
  rows: PriceMoverReportRow[];
  totalRows: number;
  totalQuantity: number;
  totalInventoryGain: number;
  biggestDollarGain: number;
  highestPercentGain: number | null;
  lastSnapshotAt: string | null;
}

interface PriceMoverQueryRow {
  [key: string]: unknown;
  cardId: string;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  finish: Finish | string;
  condition: string;
  binder: string;
  quantity: number | string;
  imageUrl: string | null;
  currentPriceCents: number | string | null;
  previousPriceCents: number | string;
  newPriceCents: number | string;
  dollarGainCents: number | string;
  percentGain: number | string | null;
  capturedAt: string | Date;
}

export interface GetPriceMoversReportOptions {
  limit?: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function ensureCardPriceSnapshotsTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS card_price_snapshots (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      card_id TEXT NOT NULL,
      scryfall_id TEXT,
      previous_price INTEGER,
      new_price INTEGER,
      source TEXT NOT NULL,
      actor_email TEXT,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS card_price_snapshots_card_id_captured_at_idx
    ON card_price_snapshots (card_id, captured_at DESC)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS card_price_snapshots_captured_at_idx
    ON card_price_snapshots (captured_at DESC)
  `);
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || limit === undefined) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit)));
}

function numberFromDb(value: number | string | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function centsToDollars(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

function percentFromDb(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = numberFromDb(value);
  return Number(parsed.toFixed(2));
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function mapPriceMoverRow(row: PriceMoverQueryRow): PriceMoverReportRow {
  const previousPriceCents = numberFromDb(row.previousPriceCents);
  const currentPriceCents = numberFromDb(row.currentPriceCents ?? row.newPriceCents);
  const dollarGainCents = "dollarGainCents" in row && row.dollarGainCents !== undefined
    ? numberFromDb(row.dollarGainCents)
    : currentPriceCents - previousPriceCents;
  const quantity = numberFromDb(row.quantity);

  return {
    cardId: row.cardId,
    name: row.name,
    setCode: row.setCode,
    setName: row.setName,
    collectorNumber: row.collectorNumber,
    finish: row.finish as Finish,
    condition: row.condition,
    binder: row.binder,
    quantity,
    imageUrl: row.imageUrl ?? null,
    previousPrice: centsToDollars(previousPriceCents),
    currentPrice: centsToDollars(currentPriceCents),
    dollarGain: centsToDollars(dollarGainCents),
    percentGain: row.percentGain !== undefined
      ? percentFromDb(row.percentGain)
      : previousPriceCents > 0
        ? Number(((dollarGainCents * 100) / previousPriceCents).toFixed(2))
        : null,
    inventoryGain: centsToDollars(dollarGainCents * quantity),
    lastMovedAt: toIsoString(row.capturedAt),
  };
}

export async function getPriceMoversReport(
  options: GetPriceMoversReportOptions = {},
): Promise<PriceMoversReport> {
  await ensureCardPriceSnapshotsTable();
  const limit = normalizeLimit(options.limit);

  const result = await db.execute<PriceMoverQueryRow>(sql`
    WITH latest_change AS (
      SELECT DISTINCT ON (card_price_snapshots.card_id)
        card_price_snapshots.id,
        card_price_snapshots.card_id,
        card_price_snapshots.scryfall_id,
        card_price_snapshots.previous_price,
        card_price_snapshots.new_price,
        card_price_snapshots.source,
        card_price_snapshots.actor_email,
        card_price_snapshots.captured_at
      FROM card_price_snapshots
      WHERE card_price_snapshots.previous_price IS NOT NULL
        AND card_price_snapshots.new_price IS NOT NULL
      ORDER BY
        card_price_snapshots.card_id,
        card_price_snapshots.captured_at DESC,
        card_price_snapshots.id DESC
    ),
    positive_movers AS (
      SELECT
        cards.id AS "cardId",
        cards.name,
        cards.set_code AS "setCode",
        cards.set_name AS "setName",
        cards.collector_number AS "collectorNumber",
        cards.finish,
        cards.condition,
        cards.binder,
        cards.quantity,
        cards.image_url AS "imageUrl",
        cards.price AS "currentPriceCents",
        latest_change.previous_price AS "previousPriceCents",
        latest_change.new_price AS "newPriceCents",
        (latest_change.new_price - latest_change.previous_price) AS dollar_gain_cents,
        (latest_change.new_price - latest_change.previous_price) AS "dollarGainCents",
        CASE
          WHEN latest_change.previous_price > 0 THEN
            ROUND(((latest_change.new_price - latest_change.previous_price)::numeric * 100) / latest_change.previous_price, 2)
          ELSE NULL
        END AS "percentGain",
        latest_change.captured_at AS "capturedAt"
      FROM latest_change
      INNER JOIN cards ON cards.id = latest_change.card_id
      WHERE cards.quantity > 0
        AND new_price > previous_price
    )
    SELECT *
    FROM positive_movers
    ORDER BY dollar_gain_cents DESC, "percentGain" DESC NULLS LAST, name ASC
    LIMIT ${limit}
  `);

  const rows = result.rows.map(mapPriceMoverRow);
  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);
  const totalInventoryGain = Number(
    rows.reduce((sum, row) => sum + row.inventoryGain, 0).toFixed(2),
  );
  const biggestDollarGain = rows[0]?.dollarGain ?? 0;
  const highestPercentGain = rows.reduce<number | null>((highest, row) => {
    if (row.percentGain === null) return highest;
    return highest === null ? row.percentGain : Math.max(highest, row.percentGain);
  }, null);
  const lastSnapshotAt = rows.reduce<string | null>((latest, row) => {
    if (!latest) return row.lastMovedAt;
    return new Date(row.lastMovedAt).getTime() > new Date(latest).getTime()
      ? row.lastMovedAt
      : latest;
  }, null);

  return {
    generatedAt: new Date().toISOString(),
    rows,
    totalRows: rows.length,
    totalQuantity,
    totalInventoryGain,
    biggestDollarGain,
    highestPercentGain,
    lastSnapshotAt,
  };
}
