import "server-only";

import { eq, count, max, asc, desc, ilike, and, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { adminAuditLog, cards, importHistory } from "@/db/schema";
import { cardToRow } from "@/db/seed";
import type {
  AdminCard,
  CardData,
  Finish,
  InventoryRow,
} from "@/lib/types";
import type { ScopedImportAuditMetadata } from "@/lib/import-contract";

export type { ScopedImportAuditMetadata } from "@/lib/import-contract";

/**
 * Data access layer for the storefront.
 * All storefront pages and API routes import card data from this single module.
 *
 * Design assumptions:
 * - Small store: ~136 cards, all fetched unbounded (no pagination needed yet)
 * - Always-fresh: force-dynamic on all pages, no caching layer
 * - Prices stored as integer cents in DB, returned as dollars to callers
 */

/**
 * Convert a Drizzle row to the disaggregated per-binder InventoryRow shape.
 * Exported for testing.
 *
 * Maps a Drizzle cards row to the application InventoryRow (formerly Card)
 * shape. The DB columns map 1:1 to the application fields after the v1.3
 * migration (binder + finish enum). See `src/lib/types.ts` for the
 * InventoryRow contract.
 *
 * v1.3 Phase 20 D-03: this is the disaggregated (5-segment id) per-binder
 * row. Aggregated public-facing rows go through `rowToAggregatedCard` and
 * the AdminCard / PublicCard types.
 */
export function rowToCard(row: typeof cards.$inferSelect): InventoryRow {
  return {
    id: row.id,
    name: row.name,
    setCode: row.setCode,
    setName: row.setName,
    collectorNumber: row.collectorNumber,
    price: row.price !== null ? row.price / 100 : null,
    condition: row.condition,
    quantity: row.quantity,
    colorIdentity: row.colorIdentity,
    imageUrl: row.imageUrl,
    backImageUrl: row.backImageUrl,
    oracleText: row.oracleText,
    typeLine: row.typeLine,
    manaValue: row.manaValue,
    rarity: row.rarity,
    finish: row.finish,
    binder: row.binder,
    scryfallId: row.scryfallId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * v1.3 Phase 20 D-01 — raw DB row shape returned by getCardsAggregated.
 * Mirrors the AS-aliased columns produced by the SQL GROUP BY query so
 * `db.execute<AggregatedCardRow>` types correctly. Index signature is
 * required to satisfy the Drizzle `db.execute<T extends Record<string, any>>`
 * generic constraint.
 */
interface AggregatedCardRow {
  [key: string]: unknown;
  id: string;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  /** AVG(price)::int cents, or null when every binder price is NULL */
  price: number | null;
  condition: string;
  quantity: number;
  colorIdentity: string[];
  imageUrl: string | null;
  backImageUrl: string | null;
  oracleText: string | null;
  typeLine: string | null;
  manaValue: number | null;
  rarity: string;
  finish: Finish;
  binders: string[];
  scryfallId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * v1.3 Phase 20 D-01 — convert an aggregated DB row (from getCardsAggregated
 * SQL) to the AdminCard application shape. Cents → dollars, Date → ISO
 * string. Exported for direct unit testing parallel to `rowToCard`.
 */
export function rowToAggregatedCard(row: AggregatedCardRow): AdminCard {
  return {
    id: row.id,
    name: row.name,
    setCode: row.setCode,
    setName: row.setName,
    collectorNumber: row.collectorNumber,
    price: row.price !== null ? row.price / 100 : null,
    condition: row.condition,
    quantity: row.quantity,
    colorIdentity: row.colorIdentity,
    imageUrl: row.imageUrl,
    backImageUrl: row.backImageUrl,
    oracleText: row.oracleText,
    typeLine: row.typeLine,
    manaValue: row.manaValue,
    rarity: row.rarity,
    finish: row.finish,
    binders: row.binders,
    scryfallId: row.scryfallId ?? null,
    createdAt:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt:
      row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

/**
 * Fetch all cards from the database, ordered by name ASC.
 * Returns InventoryRow[] (disaggregated per-binder rows) with prices in dollars.
 *
 * v1.3 Phase 20 D-03: per-binder rows. Storefront uses
 * `getCardsAggregated()` instead; this function remains for admin/internal
 * paths that need the disaggregated source rows.
 */
export async function getCards(): Promise<InventoryRow[]> {
  const rows = await db.select().from(cards).orderBy(asc(cards.name));
  return rows.map(rowToCard);
}

/**
 * Fetch a single card by its composite ID.
 * Returns InventoryRow or null if not found.
 */
export async function getCardById(id: string): Promise<InventoryRow | null> {
  const rows = await db
    .select()
    .from(cards)
    .where(eq(cards.id, id))
    .limit(1);
  return rows.length > 0 ? rowToCard(rows[0]) : null;
}

/**
 * v1.3 Phase 20 D-01 — aggregated storefront-facing card list. GROUPs the
 * per-binder cards table by (setCode, collectorNumber, finish, condition)
 * so the buyer sees one row per logical card with SUM(quantity) and
 * AVG(price). The `binders[]` array (sorted distinct ASC) is admin-only
 * and MUST be stripped before this data crosses any public boundary
 * (D-05/D-06 + AGG-02; enforced via the PublicCard type).
 *
 * Notes:
 *   - `setName`, `name`, `imageUrl`, `backImageUrl`, `oracleText`,
 *     `typeLine`, `manaValue`, `rarity`, `scryfallId` use `MAX(...)` because they are identical
 *     across binder rows of the same logical card (Scryfall enriches on
 *     (setCode, collectorNumber)). MAX gives a deterministic representative.
 *   - `colorIdentity` is `text[]`. `MAX(color_identity)` is deterministic
 *     because every row in a `(setCode, collectorNumber, finish, condition)`
 *     group is the same Oracle card, so all `color_identity` values match.
 *     v1.3.3 hotfix: we previously used
 *     `(ARRAY_AGG(color_identity ORDER BY binder))[1]` but Postgres errors
 *     `cannot accumulate empty arrays` (SQLSTATE 2202E) whenever ANY row in
 *     the group has `color_identity = '{}'` (artifacts, Wastes, devoid /
 *     eldrazi, etc.). `MAX` on `text[]` uses element-wise lexicographic
 *     comparison and tolerates empty arrays; if a group is mixed empty/
 *     non-empty the non-empty array wins, which is also defensively safer
 *     than returning `{}` when real color data exists.
 *   - `AVG(price)::int` rounds toward zero per Postgres `::int` cast and
 *     ignores NULL prices. If every binder price is NULL the result is
 *     NULL and rowToAggregatedCard preserves null.
 *   - `binders` is sorted distinct ASC — load-bearing input for the
 *     operator-friendly admin display in Phase 21.
 */
const aggregatedCardsSelect = sql`
  SELECT
    set_code || '-' || collector_number || '-' || finish || '-' || condition AS "id",
    MAX(name)                                                                  AS "name",
    set_code                                                                   AS "setCode",
    MAX(set_name)                                                              AS "setName",
    collector_number                                                           AS "collectorNumber",
    AVG(price)::int                                                            AS "price",
    condition                                                                  AS "condition",
    SUM(quantity)::int                                                         AS "quantity",
    MAX(color_identity)                                                        AS "colorIdentity",
    MAX(image_url)                                                             AS "imageUrl",
    MAX(back_image_url)                                                        AS "backImageUrl",
    MAX(oracle_text)                                                           AS "oracleText",
    MAX(type_line)                                                             AS "typeLine",
    MAX(mana_value)                                                            AS "manaValue",
    MAX(rarity)                                                                AS "rarity",
    finish                                                                     AS "finish",
    ARRAY_AGG(DISTINCT binder ORDER BY binder ASC)                             AS "binders",
    MAX(scryfall_id)                                                           AS "scryfallId",
    MAX(created_at)                                                            AS "createdAt",
    MAX(updated_at)                                                            AS "updatedAt"
  FROM cards
  GROUP BY set_code, collector_number, finish, condition
  HAVING SUM(quantity) > 0
`;

export async function getCardsAggregated(): Promise<AdminCard[]> {
  const result = await db.execute<AggregatedCardRow>(sql`
    ${aggregatedCardsSelect}
    ORDER BY MAX(name) ASC
  `);
  return result.rows.map(rowToAggregatedCard);
}

export async function getRecentlyAddedCards(): Promise<AdminCard[]> {
  const result = await db.execute<AggregatedCardRow>(sql`
    WITH latest_upload AS (
      SELECT COALESCE(
        (
          SELECT committed_at
          FROM import_history
          ORDER BY committed_at DESC, id DESC
          LIMIT 1
        ),
        (SELECT MAX(created_at) FROM cards)
      ) AS uploaded_at
    )
    SELECT
      set_code || '-' || collector_number || '-' || finish || '-' || condition AS "id",
      MAX(name)                                                                  AS "name",
      set_code                                                                   AS "setCode",
      MAX(set_name)                                                              AS "setName",
      collector_number                                                           AS "collectorNumber",
      AVG(price)::int                                                            AS "price",
      condition                                                                  AS "condition",
      SUM(quantity)::int                                                         AS "quantity",
      MAX(color_identity)                                                        AS "colorIdentity",
      MAX(image_url)                                                             AS "imageUrl",
      MAX(back_image_url)                                                        AS "backImageUrl",
      MAX(oracle_text)                                                           AS "oracleText",
      MAX(type_line)                                                             AS "typeLine",
      MAX(mana_value)                                                            AS "manaValue",
      MAX(rarity)                                                                AS "rarity",
      finish                                                                     AS "finish",
      ARRAY_AGG(DISTINCT binder ORDER BY binder ASC)                             AS "binders",
      MAX(scryfall_id)                                                           AS "scryfallId",
      MAX(created_at)                                                            AS "createdAt",
      MAX(updated_at)                                                            AS "updatedAt"
    FROM cards
    CROSS JOIN latest_upload
    GROUP BY set_code, collector_number, finish, condition
    HAVING SUM(quantity) > 0
      AND MAX(latest_upload.uploaded_at) IS NOT NULL
      AND MAX(created_at) >= MAX(latest_upload.uploaded_at) - INTERVAL '10 minutes'
      AND MAX(created_at) <= MAX(latest_upload.uploaded_at) + INTERVAL '10 minutes'
    ORDER BY MAX(created_at) DESC, MAX(name) ASC
  `);
  return result.rows.map(rowToAggregatedCard);
}

/**
 * Compute card metadata from the database.
 * Returns CardData["meta"] shape exactly -- totalSkipped and totalMissingPrices
 * are hardcoded 0 (not applicable for DB source, retained for type compatibility).
 */
export async function getCardsMeta(): Promise<CardData["meta"]> {
  const [result] = await db
    .select({
      totalCards: count(),
      lastUpdated: max(cards.updatedAt),
    })
    .from(cards);

  return {
    lastUpdated: result.lastUpdated?.toISOString() ?? new Date().toISOString(),
    totalCards: result.totalCards,
    totalSkipped: 0,
    totalMissingPrices: 0,
  };
}

// --- Admin query types ---

export interface AdminCardsParams {
  page?: number;
  limit?: number;
  search?: string;
  set?: string;
  condition?: string;
  binder?: string;
  sortBy?: "name" | "price" | "quantity";
  sortDir?: "asc" | "desc";
}

export interface AdminCardsResult {
  cards: InventoryRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type AdminAuditAction =
  | "inventory.update"
  | "inventory.delete_one"
  | "inventory.delete_many"
  | "inventory.delete_all"
  | "inventory.import_commit"
  | "order.status_update"
  | "order.cancel"
  | "order.restore_inventory"
  | "manabox.removal_marked"
  | "price_refresh";

export type AdminAuditTargetType = "card" | "inventory" | "order" | "order_item" | "import";

export interface AdminAuditEntry {
  id: number;
  action: AdminAuditAction;
  actorEmail: string | null;
  targetType: AdminAuditTargetType;
  targetId: string | null;
  targetCount: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CreateAdminAuditEntryInput {
  action: AdminAuditAction;
  actorEmail?: string | null;
  targetType: AdminAuditTargetType;
  targetId?: string | null;
  targetCount?: number | null;
  metadata?: Record<string, unknown>;
}

export interface AdminAuditEntriesParams {
  page?: number;
  limit?: number;
  action?: AdminAuditAction;
  targetType?: AdminAuditTargetType;
}

export interface AdminAuditEntriesResult {
  entries: AdminAuditEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ImportHistoryEntry {
  id: number;
  actorEmail: string | null;
  fileNames: string[];
  fileCount: number;
  parsedRows: number;
  skippedRows: number;
  insertedCards: number;
  metadata: Record<string, unknown>;
  committedAt: string;
}

export interface CreateImportHistoryEntryInput {
  actorEmail?: string | null;
  fileNames: string[];
  fileCount: number;
  parsedRows: number;
  skippedRows: number;
  insertedCards: number;
  metadata?: Record<string, unknown>;
}

export interface ImportHistoryParams {
  page?: number;
  limit?: number;
}

export interface ImportHistoryResult {
  entries: ImportHistoryEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminMutationAuditContext {
  actorEmail?: string | null;
  metadata?: Record<string, unknown>;
  importHistory?: CreateImportHistoryEntryInput;
}

interface AdminAuditRow {
  [key: string]: unknown;
  id: number;
  action: string;
  actorEmail?: string | null;
  targetType: string;
  targetId?: string | null;
  targetCount?: number | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string | Date;
}

interface ImportHistoryRow {
  [key: string]: unknown;
  id: number;
  actorEmail?: string | null;
  fileNames?: string[] | null;
  fileCount: number;
  parsedRows: number;
  skippedRows: number;
  insertedCards: number;
  metadata?: Record<string, unknown> | null;
  committedAt: string | Date;
}

const MAX_AUDIT_STRING_LENGTH = 320;
const MAX_AUDIT_ARRAY_LENGTH = 50;
const MAX_AUDIT_OBJECT_KEYS = 40;
const MAX_AUDIT_DEPTH = 4;
const MAX_AUDIT_METADATA_BYTES = 4096;
const REDACTED_AUDIT_VALUE = "[redacted]";
const SENSITIVE_AUDIT_KEY_PATTERN =
  /(password|secret|token|api[_-]?key|authorization|cookie|session|credential)/i;
const RAW_CONTENT_AUDIT_KEY_PATTERN =
  /(raw.*csv|csv.*raw|file.*content|content.*csv|csv.*content|request.*body|response.*body|^cards$|card.*payload|payload.*cards)/i;

function normalizeAuditPage(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) return 1;
  return Math.max(1, Math.trunc(value));
}

function normalizeAuditLimit(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) return 25;
  return Math.min(100, Math.max(1, Math.trunc(value)));
}

function truncateAuditString(value: string): string {
  if (value.length <= MAX_AUDIT_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_AUDIT_STRING_LENGTH - 1)}…`;
}

function sanitizeAuditValue(value: unknown, depth: number): unknown {
  if (value === null) return null;
  if (typeof value === "string") return truncateAuditString(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_AUDIT_ARRAY_LENGTH)
      .map((item) => sanitizeAuditValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (typeof value !== "object" || value === undefined) return undefined;
  if (depth >= MAX_AUDIT_DEPTH) return "[truncated]";

  const sanitized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value).slice(0, MAX_AUDIT_OBJECT_KEYS)) {
    if (
      SENSITIVE_AUDIT_KEY_PATTERN.test(key) ||
      RAW_CONTENT_AUDIT_KEY_PATTERN.test(key)
    ) {
      sanitized[key] = REDACTED_AUDIT_VALUE;
      continue;
    }

    const sanitizedChild = sanitizeAuditValue(child, depth + 1);
    if (sanitizedChild !== undefined) sanitized[key] = sanitizedChild;
  }
  return sanitized;
}

function sanitizeAdminAuditMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const sanitized = sanitizeAuditValue(metadata ?? {}, 0) as Record<string, unknown>;
  const serialized = JSON.stringify(sanitized);
  if (serialized.length <= MAX_AUDIT_METADATA_BYTES) return sanitized;

  return {
    truncated: true,
    summary: truncateAuditString(serialized),
  };
}

function normalizeAdminAuditAction(value: string): AdminAuditAction {
  const allowed: readonly AdminAuditAction[] = [
    "inventory.update",
    "inventory.delete_one",
    "inventory.delete_many",
    "inventory.delete_all",
    "inventory.import_commit",
    "order.status_update",
    "order.cancel",
    "order.restore_inventory",
    "manabox.removal_marked",
    "price_refresh",
  ];
  return allowed.includes(value as AdminAuditAction)
    ? (value as AdminAuditAction)
    : "inventory.update";
}

function normalizeAdminAuditTargetType(value: string): AdminAuditTargetType {
  const allowed: readonly AdminAuditTargetType[] = [
    "card",
    "inventory",
    "order",
    "order_item",
    "import",
  ];
  return allowed.includes(value as AdminAuditTargetType)
    ? (value as AdminAuditTargetType)
    : "inventory";
}

function normalizeAdminAuditEntry(row: AdminAuditRow): AdminAuditEntry {
  return {
    id: row.id,
    action: normalizeAdminAuditAction(row.action),
    actorEmail: row.actorEmail ?? null,
    targetType: normalizeAdminAuditTargetType(row.targetType),
    targetId: row.targetId ?? null,
    targetCount: row.targetCount ?? null,
    metadata: row.metadata ?? {},
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

function buildAdminAuditInsertValues(input: CreateAdminAuditEntryInput) {
  return {
    action: input.action,
    actorEmail: input.actorEmail ?? null,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    targetCount: input.targetCount ?? null,
    metadata: sanitizeAdminAuditMetadata(input.metadata),
  };
}

function normalizeImportHistoryEntry(row: ImportHistoryRow): ImportHistoryEntry {
  return {
    id: row.id,
    actorEmail: row.actorEmail ?? null,
    fileNames: row.fileNames ?? [],
    fileCount: row.fileCount,
    parsedRows: row.parsedRows,
    skippedRows: row.skippedRows,
    insertedCards: row.insertedCards,
    metadata: row.metadata ?? {},
    committedAt:
      row.committedAt instanceof Date
        ? row.committedAt.toISOString()
        : row.committedAt,
  };
}

function normalizeImportHistoryCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function buildImportHistoryInsertValues(input: CreateImportHistoryEntryInput) {
  return {
    actorEmail: input.actorEmail ?? null,
    fileNames: input.fileNames
      .filter((fileName) => typeof fileName === "string" && fileName.trim().length > 0)
      .slice(0, MAX_AUDIT_ARRAY_LENGTH)
      .map((fileName) => truncateAuditString(fileName.trim())),
    fileCount: normalizeImportHistoryCount(input.fileCount),
    parsedRows: normalizeImportHistoryCount(input.parsedRows),
    skippedRows: normalizeImportHistoryCount(input.skippedRows),
    insertedCards: normalizeImportHistoryCount(input.insertedCards),
    metadata: sanitizeAdminAuditMetadata(input.metadata),
  };
}

export async function createImportHistoryEntry(
  input: CreateImportHistoryEntryInput,
): Promise<ImportHistoryEntry> {
  const [row] = await db
    .insert(importHistory)
    .values(buildImportHistoryInsertValues(input))
    .returning();

  if (!row) throw new Error("Import history insert returned no row");
  return normalizeImportHistoryEntry(row);
}

export async function getImportHistory(
  params: ImportHistoryParams = {},
): Promise<ImportHistoryResult> {
  const page = normalizeAuditPage(params.page);
  const limit = normalizeAuditLimit(params.limit);
  const offset = (page - 1) * limit;

  const [entriesResult, countResult] = await Promise.all([
    db.execute<ImportHistoryRow>(sql`
      SELECT
        id,
        actor_email AS "actorEmail",
        file_names AS "fileNames",
        file_count AS "fileCount",
        parsed_rows AS "parsedRows",
        skipped_rows AS "skippedRows",
        inserted_cards AS "insertedCards",
        metadata,
        committed_at AS "committedAt"
      FROM import_history
      ORDER BY committed_at DESC, id DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `),
    db.execute<{ total: number | string }>(sql`
      SELECT COUNT(*)::integer AS total
      FROM import_history
    `),
  ]);

  const total = typeof countResult.rows[0]?.total === "string"
    ? Number.parseInt(countResult.rows[0].total, 10)
    : (countResult.rows[0]?.total ?? 0);

  return {
    entries: entriesResult.rows.map(normalizeImportHistoryEntry),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function createAdminAuditEntry(
  input: CreateAdminAuditEntryInput,
): Promise<AdminAuditEntry> {
  const [row] = await db
    .insert(adminAuditLog)
    .values(buildAdminAuditInsertValues(input))
    .returning();

  if (!row) throw new Error("Audit insert returned no row");
  return normalizeAdminAuditEntry(row);
}

export async function getAdminAuditEntries(
  params: AdminAuditEntriesParams = {},
): Promise<AdminAuditEntriesResult> {
  const page = normalizeAuditPage(params.page);
  const limit = normalizeAuditLimit(params.limit);
  const offset = (page - 1) * limit;
  const filters: SQL[] = [];

  if (params.action) filters.push(sql`action = ${params.action}`);
  if (params.targetType) filters.push(sql`target_type = ${params.targetType}`);

  const whereClause = filters.length > 0 ? sql`WHERE ${sql.join(filters, sql` AND `)}` : sql``;

  const [entriesResult, countResult] = await Promise.all([
    db.execute<AdminAuditRow>(sql`
      SELECT
        id,
        action,
        actor_email AS "actorEmail",
        target_type AS "targetType",
        target_id AS "targetId",
        target_count AS "targetCount",
        metadata,
        created_at AS "createdAt"
      FROM admin_audit_log
      ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `),
    db.execute<{ total: number | string }>(sql`
      SELECT COUNT(*)::integer AS total
      FROM admin_audit_log
      ${whereClause}
    `),
  ]);

  const total = typeof countResult.rows[0]?.total === "string"
    ? Number.parseInt(countResult.rows[0].total, 10)
    : (countResult.rows[0]?.total ?? 0);

  return {
    entries: entriesResult.rows.map(normalizeAdminAuditEntry),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

async function createMutationAuditEntry(
  audit: AdminMutationAuditContext | undefined,
  input: Omit<CreateAdminAuditEntryInput, "actorEmail" | "metadata"> & {
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  if (!audit) return;
  await createAdminAuditEntry({
    ...input,
    actorEmail: audit.actorEmail ?? null,
    metadata: { ...(audit.metadata ?? {}), ...(input.metadata ?? {}) },
  });
}

export interface AdminDashboardBreakdown {
  quantity: number;
  uniqueCards: number;
  value: number;
}

export interface AdminDashboardStats {
  inventory: {
    uniqueCards: number;
    totalQuantity: number;
    totalValue: number;
    lowStockCount: number;
    missingPriceCount: number;
  };
  breakdowns: {
    bySet: Array<AdminDashboardBreakdown & { setCode: string }>;
    byColor: Array<AdminDashboardBreakdown & { color: string }>;
    byRarity: Array<AdminDashboardBreakdown & { rarity: string }>;
    byBinder: Array<AdminDashboardBreakdown & { binder: string }>;
  };
}

interface DashboardBreakdownAccumulator {
  quantity: number;
  uniqueCards: number;
  valueCents: number;
}

const COLOR_SORT_ORDER = ["W", "U", "B", "R", "G"];

function toDollars(cents: number): number {
  return cents / 100;
}

function normalizeColorIdentity(colorIdentity: string[]): string {
  if (colorIdentity.length === 0) return "C";

  return [...colorIdentity]
    .sort((a, b) => {
      const aIndex = COLOR_SORT_ORDER.indexOf(a);
      const bIndex = COLOR_SORT_ORDER.indexOf(b);
      const normalizedAIndex = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
      const normalizedBIndex = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
      return normalizedAIndex - normalizedBIndex || a.localeCompare(b);
    })
    .join("");
}

function addBreakdownEntry(
  map: Map<string, DashboardBreakdownAccumulator>,
  key: string,
  quantity: number,
  valueCents: number,
) {
  const current = map.get(key) ?? { quantity: 0, uniqueCards: 0, valueCents: 0 };
  current.quantity += quantity;
  current.uniqueCards += 1;
  current.valueCents += valueCents;
  map.set(key, current);
}

function mapBreakdown<TKey extends string>(
  map: Map<string, DashboardBreakdownAccumulator>,
  keyName: TKey,
): Array<AdminDashboardBreakdown & Record<TKey, string>> {
  return [...map.entries()]
    .map(([key, value]) => ({
      [keyName]: key,
      quantity: value.quantity,
      uniqueCards: value.uniqueCards,
      value: toDollars(value.valueCents),
    }) as AdminDashboardBreakdown & Record<TKey, string>)
    .sort((a, b) => b.quantity - a.quantity || a[keyName].localeCompare(b[keyName]));
}

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  const rows = await db
    .select({
      id: cards.id,
      setCode: cards.setCode,
      price: cards.price,
      quantity: cards.quantity,
      colorIdentity: cards.colorIdentity,
      rarity: cards.rarity,
      binder: cards.binder,
    })
    .from(cards);

  const bySet = new Map<string, DashboardBreakdownAccumulator>();
  const byColor = new Map<string, DashboardBreakdownAccumulator>();
  const byRarity = new Map<string, DashboardBreakdownAccumulator>();
  const byBinder = new Map<string, DashboardBreakdownAccumulator>();

  let totalQuantity = 0;
  let totalValueCents = 0;
  let lowStockCount = 0;
  let missingPriceCount = 0;

  for (const row of rows) {
    const valueCents = (row.price ?? 0) * row.quantity;
    totalQuantity += row.quantity;
    totalValueCents += valueCents;
    if (row.quantity === 1) lowStockCount += 1;
    if (row.price === null) missingPriceCount += 1;

    addBreakdownEntry(bySet, row.setCode, row.quantity, valueCents);
    addBreakdownEntry(
      byColor,
      normalizeColorIdentity(row.colorIdentity),
      row.quantity,
      valueCents,
    );
    addBreakdownEntry(byRarity, row.rarity, row.quantity, valueCents);
    addBreakdownEntry(byBinder, row.binder, row.quantity, valueCents);
  }

  return {
    inventory: {
      uniqueCards: rows.length,
      totalQuantity,
      totalValue: toDollars(totalValueCents),
      lowStockCount,
      missingPriceCount,
    },
    breakdowns: {
      bySet: mapBreakdown(bySet, "setCode"),
      byColor: mapBreakdown(byColor, "color"),
      byRarity: mapBreakdown(byRarity, "rarity"),
      byBinder: mapBreakdown(byBinder, "binder"),
    },
  };
}

/** Fetch paginated, filtered, sorted cards for admin table */
export async function getAdminCards(
  params: AdminCardsParams = {},
): Promise<AdminCardsResult> {
  const {
    page = 1,
    limit = 50,
    search = "",
    set = "",
    condition = "",
    binder = "",
    sortBy = "name",
    sortDir = "asc",
  } = params;

  const conditions: SQL[] = [];
  if (search) conditions.push(ilike(cards.name, `%${search}%`));
  if (set) conditions.push(eq(cards.setCode, set));
  if (condition) conditions.push(eq(cards.condition, condition));
  if (binder) conditions.push(eq(cards.binder, binder));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const offset = (page - 1) * limit;
  const sortColumn =
    sortBy === "price"
      ? cards.price
      : sortBy === "quantity"
        ? cards.quantity
        : cards.name;
  const sortOrder = sortDir === "desc" ? desc(sortColumn) : asc(sortColumn);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(cards)
      .where(where)
      .orderBy(sortOrder)
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(cards).where(where),
  ]);

  return {
    cards: rows.map(rowToCard),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Update a card's editable fields.
 * Price is in dollars (converted to cents for storage).
 * Returns updated InventoryRow or null if not found.
 */
export async function updateCard(
  id: string,
  updates: { price?: number; quantity?: number; condition?: string },
  audit?: AdminMutationAuditContext,
): Promise<InventoryRow | null> {
  const dbUpdates: Record<string, unknown> = {};
  if (updates.price !== undefined)
    dbUpdates.price = Math.round(updates.price * 100);
  if (updates.quantity !== undefined) dbUpdates.quantity = updates.quantity;
  if (updates.condition !== undefined) dbUpdates.condition = updates.condition;

  if (Object.keys(dbUpdates).length === 0) return null;

  const result = await db
    .update(cards)
    .set(dbUpdates)
    .where(eq(cards.id, id))
    .returning();
  if (result.length === 0) return null;

  await createMutationAuditEntry(audit, {
    action: "inventory.update",
    targetType: "card",
    targetId: id,
    targetCount: 1,
    metadata: {
      changedFields: Object.keys(updates).filter(
        (field) => updates[field as keyof typeof updates] !== undefined,
      ),
      newValues: updates,
      cardName: result[0].name,
    },
  });

  return rowToCard(result[0]);
}

/** Delete a card by ID. Returns true if deleted, false if not found. */
export async function deleteCard(
  id: string,
  audit?: AdminMutationAuditContext,
): Promise<boolean> {
  const result = await db
    .delete(cards)
    .where(eq(cards.id, id))
    .returning({ id: cards.id, name: cards.name });

  if (result.length === 0) return false;

  await createMutationAuditEntry(audit, {
    action: "inventory.delete_one",
    targetType: "card",
    targetId: id,
    targetCount: 1,
    metadata: {
      cardName: result[0].name,
    },
  });

  return true;
}

/** Delete selected cards by ID. Returns actual deleted row IDs. */
export async function deleteCardsByIds(
  ids: string[],
  audit?: AdminMutationAuditContext,
): Promise<{ deleted: number; ids: string[] }> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) {
    return { deleted: 0, ids: [] };
  }

  const deletedRows = await db
    .delete(cards)
    .where(inArray(cards.id, uniqueIds))
    .returning({ id: cards.id });

  const deletedIds = deletedRows.map((row) => row.id);
  if (deletedIds.length > 0) {
    await createMutationAuditEntry(audit, {
      action: "inventory.delete_many",
      targetType: "inventory",
      targetId: null,
      targetCount: deletedIds.length,
      metadata: {
        requestedCount: uniqueIds.length,
        deletedIds,
      },
    });
  }

  return {
    deleted: deletedIds.length,
    ids: deletedIds,
  };
}

/** Fetch all cards (unpaginated) for CSV export. Returns raw DB rows (not converted). */
export async function getAllCardsForExport() {
  return db.select().from(cards).orderBy(asc(cards.name));
}

/**
 * Atomic destructive replace of inventory in the SELECTED binders only.
 * Inventory in unselected binders is bit-for-bit unchanged.
 *
 * SCOPED DELETE WHERE binder IN (selectedBinders) — NEVER an unbounded
 * DELETE. The function THROWS BEFORE any DB work if (a) selectedBinders
 * is empty (would unbound the DELETE — D-18), or (b) any newCards entry
 * has a binder NOT in selectedBinders (would silently lose data — D-18
 * belt-and-suspenders against the typed deletedFromUnselected: 0 invariant).
 *
 * Uses db.batch([...]) — see Phase 10 rationale (drizzle-orm neon-http has
 * no interactive transactions). The order is:
 *   1. SELECT before-counts (NOT in the batch — pre-flight read)
 *   2. db.$count(cards) for totalBefore (also pre-flight)
 *   3. db.batch([
 *        DELETE cards WHERE binder IN (selectedBinders),
 *        INSERT cards VALUES (rows),    // omitted when newCards is []
 *        INSERT adminAuditLog (...),    // when audit is present
 *        INSERT importHistory (...),    // when audit.importHistory is present
 *      ])
 *
 * Audit + importHistory metadata is the bounded ScopedImportAuditMetadata
 * shape (D-17), capped per list at MAX_AUDIT_ARRAY_LENGTH; total payload
 * stays under MAX_AUDIT_METADATA_BYTES (4KB).
 */
export async function replaceCardsForBinders(
  newCards: InventoryRow[],
  selectedBinders: string[],
  audit?: AdminMutationAuditContext & { knownBinders?: string[] },
): Promise<{ inserted: number; deleted: number }> {
  // ---- Pre-flight invariants (D-18) -----------------------------------------
  if (selectedBinders.length === 0) {
    throw new Error(
      "replaceCardsForBinders: selectedBinders is empty (would unbound DELETE)",
    );
  }
  const selectedBinderSet = new Set(selectedBinders);
  for (const card of newCards) {
    if (!selectedBinderSet.has(card.binder)) {
      throw new Error(
        `replaceCardsForBinders: card ${card.id} has binder "${card.binder}" not in selectedBinders`,
      );
    }
  }

  // ---- Per-binder before-counts (single SELECT) -----------------------------
  const beforeRows = await db
    .select({ binder: cards.binder, count: sql<number>`count(*)::int` })
    .from(cards)
    .where(inArray(cards.binder, selectedBinders))
    .groupBy(cards.binder);
  const beforeCounts: Record<string, number> = {};
  for (const r of beforeRows) {
    beforeCounts[r.binder] = r.count;
  }
  // Selected binders that had zero rows before are absent from beforeRows;
  // backfill them with 0 so the audit map enumerates every selected binder.
  for (const b of selectedBinders) {
    if (!(b in beforeCounts)) beforeCounts[b] = 0;
  }
  const totalBeforeForSelected = Object.values(beforeCounts).reduce(
    (s, n) => s + n,
    0,
  );

  // ---- Per-binder after-counts (purely from input array) --------------------
  const afterCounts: Record<string, number> = Object.fromEntries(
    selectedBinders.map((b) => [b, 0]),
  );
  for (const c of newCards) {
    afterCounts[c.binder] = (afterCounts[c.binder] ?? 0) + 1;
  }

  // ---- totalCardsAfterImport via db.$count (pre-commit) ---------------------
  const currentTotal = await db.$count(cards);

  // ---- newBinders / missingBinders relative to known ------------------------
  const known = audit?.knownBinders ?? [];
  const knownSet = new Set(known);
  const newBindersInExport = selectedBinders.filter((b) => !knownSet.has(b));
  const missingBindersFromExport = known.filter(
    (b) => !selectedBinderSet.has(b),
  );

  // ---- Build ScopedImportAuditMetadata (D-17, list caps applied) ------------
  const scopedMetadata: ScopedImportAuditMetadata = {
    selectedBinders: selectedBinders.slice(0, MAX_AUDIT_ARRAY_LENGTH),
    totalBindersInExport: new Set(newCards.map((c) => c.binder)).size,
    scopedReplaceCounts: {
      before: beforeCounts,
      after: afterCounts,
      deletedFromUnselected: 0,
    },
    totalCardsAfterImport: currentTotal - totalBeforeForSelected + newCards.length,
    newBindersInExport: newBindersInExport.slice(0, MAX_AUDIT_ARRAY_LENGTH),
    missingBindersFromExport: missingBindersFromExport.slice(
      0,
      MAX_AUDIT_ARRAY_LENGTH,
    ),
  };

  // ---- Build batch statements -----------------------------------------------
  const rows = newCards.map(cardToRow);
  const deleteStatement = db.delete(cards).where(
    inArray(cards.binder, selectedBinders),
  );
  const insertStatement = rows.length > 0 ? db.insert(cards).values(rows) : null;
  const auditInsert = audit
    ? db.insert(adminAuditLog).values(
        buildAdminAuditInsertValues({
          action: "inventory.import_commit",
          actorEmail: audit.actorEmail ?? null,
          targetType: "import",
          targetId: null,
          targetCount: rows.length,
          metadata: {
            ...(audit.metadata ?? {}),
            ...scopedMetadata,
            insertedCards: rows.length,
          },
        }),
      )
    : null;
  const importHistoryInsert = audit?.importHistory
    ? db.insert(importHistory).values(
        buildImportHistoryInsertValues({
          ...audit.importHistory,
          actorEmail:
            audit.importHistory.actorEmail ?? audit.actorEmail ?? null,
          insertedCards: rows.length,
          metadata: {
            ...(audit.importHistory.metadata ?? {}),
            ...scopedMetadata,
          },
        }),
      )
    : null;

  await db.batch(
    [deleteStatement, insertStatement, auditInsert, importHistoryInsert].filter(
      Boolean,
    ) as unknown as Parameters<typeof db.batch>[0],
  );

  return { inserted: rows.length, deleted: totalBeforeForSelected };
}

/** Delete every card from inventory. Returns the number of rows removed. */
export async function deleteAllCards(
  audit?: AdminMutationAuditContext,
): Promise<{ deleted: number }> {
  const deletedRows = await db
    .delete(cards)
    .returning({ id: cards.id });
  await createMutationAuditEntry(audit, {
    action: "inventory.delete_all",
    targetType: "inventory",
    targetId: null,
    targetCount: deletedRows.length,
    metadata: {
      deletedCount: deletedRows.length,
    },
  });
  return { deleted: deletedRows.length };
}
