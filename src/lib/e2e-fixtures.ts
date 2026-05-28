import type {
  AdminOrderDetail,
  AdminOrdersResult,
  AdminOrderStatusCounts,
  OrderTimelineEvent,
} from "@/db/orders";
import type { ManaBoxRemovalReport } from "@/db/manabox-removals";
import type {
  AdminAuditEntriesParams,
  AdminAuditEntriesResult,
  AdminCardsParams,
  AdminCardsResult,
  AdminDashboardStats,
  ImportHistoryResult,
} from "@/db/queries";
import type { AdminHealthSnapshot } from "@/db/admin-health";
import type { CardData, InventoryRow, PublicCard } from "@/lib/types";

export function e2eFixturesEnabled(): boolean {
  return process.env.E2E_FIXTURES === "1" && process.env.NODE_ENV !== "production";
}

export const e2eFixtureCards: PublicCard[] = [
  {
    id: "e2e-045-normal-lightly_played",
    name: "Counterspell",
    setCode: "e2e",
    setName: "E2E Masters",
    collectorNumber: "045",
    price: 2,
    condition: "lightly_played",
    quantity: 4,
    colorIdentity: ["U"],
    imageUrl: null,
    backImageUrl: null,
    oracleText: "Counter target spell.",
    typeLine: "Instant",
    manaCost: "{U}{U}",
    manaValue: 2,
    rarity: "uncommon",
    finish: "normal",
    scryfallId: "e2e-counterspell",
    createdAt: "2026-05-21T00:00:00.000Z",
    updatedAt: "2026-05-21T00:00:00.000Z",
  },
  {
    id: "e2e-150-normal-near_mint",
    name: "Lightning Bolt",
    setCode: "e2e",
    setName: "E2E Masters",
    collectorNumber: "150",
    price: 3.5,
    condition: "near_mint",
    quantity: 3,
    colorIdentity: ["R"],
    imageUrl: null,
    backImageUrl: null,
    oracleText: "Lightning Bolt deals 3 damage to any target.",
    typeLine: "Instant",
    manaCost: "{R}",
    manaValue: 1,
    rarity: "common",
    finish: "normal",
    scryfallId: "e2e-lightning-bolt",
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z",
  },
  {
    id: "e2e-001-foil-near_mint",
    name: "Sol Ring",
    setCode: "e2e",
    setName: "E2E Masters",
    collectorNumber: "001",
    price: 4.25,
    condition: "near_mint",
    quantity: 2,
    colorIdentity: [],
    imageUrl: null,
    backImageUrl: null,
    oracleText: "{T}: Add {C}{C}.",
    typeLine: "Artifact",
    manaCost: "{1}",
    manaValue: 1,
    rarity: "uncommon",
    finish: "foil",
    scryfallId: "e2e-sol-ring",
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
  },
  {
    id: "e2e-001-normal-near_mint",
    name: "Sol Ring",
    setCode: "e2e",
    setName: "E2E Masters",
    collectorNumber: "001",
    price: 3.25,
    condition: "near_mint",
    quantity: 1,
    colorIdentity: [],
    imageUrl: null,
    backImageUrl: null,
    oracleText: "{T}: Add {C}{C}.",
    typeLine: "Artifact",
    manaCost: "{1}",
    manaValue: 1,
    rarity: "uncommon",
    finish: "normal",
    scryfallId: "e2e-sol-ring",
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
  },
  {
    id: "e2e-001e-foil-near_mint",
    name: "Sol Ring",
    setCode: "e2e",
    setName: "E2E Masters Extended Art",
    collectorNumber: "001e",
    price: 6.5,
    condition: "near_mint",
    quantity: 1,
    colorIdentity: [],
    imageUrl: null,
    backImageUrl: null,
    oracleText: "{T}: Add {C}{C}.",
    typeLine: "Artifact",
    manaCost: "{1}",
    manaValue: 1,
    rarity: "uncommon",
    finish: "foil",
    scryfallId: "e2e-sol-ring-extended-art",
    createdAt: "2026-05-20T00:00:00.000Z",
    updatedAt: "2026-05-20T00:00:00.000Z",
  },
];

export const e2eFixtureMeta: CardData["meta"] = {
  lastUpdated: "2026-05-23T00:00:00.000Z",
  totalCards: e2eFixtureCards.reduce((sum, card) => sum + card.quantity, 0),
  totalSkipped: 0,
  totalMissingPrices: 0,
};

function normalizeFixtureCardCount(value: string | undefined): number | null {
  if (!value) return null;
  const count = Number(value);
  if (!Number.isFinite(count)) return null;
  return Math.min(2_500, Math.max(e2eFixtureCards.length, Math.trunc(count)));
}

function makeE2eBulkFixtureCards(count: number): PublicCard[] {
  return Array.from({ length: count }, (_, index) => {
    const seed = e2eFixtureCards[index % e2eFixtureCards.length];
    const displayIndex = index + 1;

    return {
      ...seed,
      id: `e2e-bulk-${displayIndex.toString().padStart(4, "0")}`,
      name: `Fixture Bulk Card ${displayIndex.toString().padStart(4, "0")}`,
      collectorNumber: `${displayIndex}`,
      setCode: "blk",
      setName: "E2E Bulk Masters",
      price: Number((((index % 97) + 1) / 2).toFixed(2)),
      quantity: 1,
      imageUrl: null,
      backImageUrl: null,
      oracleText: "Large fixture card for mobile storefront scroll performance.",
      scryfallId: `e2e-bulk-${displayIndex.toString().padStart(4, "0")}`,
      createdAt: new Date(Date.UTC(2026, 4, 23, 0, 0, displayIndex)).toISOString(),
      updatedAt: "2026-05-23T00:00:00.000Z",
    };
  });
}

export function getE2eStorefrontFixtureCards(): PublicCard[] {
  const bulkCount = normalizeFixtureCardCount(process.env.E2E_BULK_FIXTURE_COUNT);
  if (!bulkCount) return e2eFixtureCards;
  return makeE2eBulkFixtureCards(bulkCount);
}

export function getE2eStorefrontFixtureMeta(
  cards = getE2eStorefrontFixtureCards(),
): CardData["meta"] {
  return {
    ...e2eFixtureMeta,
    totalCards: cards.reduce((sum, card) => sum + card.quantity, 0),
  };
}

const fixtureBinders = ["trade-box", "a02", "b01", "b02", "b03"] as const;

export const e2eFixtureAdminCards: InventoryRow[] = e2eFixtureCards.map(
  (card, index) => ({
    ...card,
    id: `${card.id}-${fixtureBinders[index]}`,
    binder: fixtureBinders[index],
  }),
);

function normalizeFixturePage(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) return 1;
  return Math.max(1, Math.trunc(value));
}

function normalizeFixtureLimit(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) return 50;
  return Math.min(200, Math.max(1, Math.trunc(value)));
}

export function getE2eFixtureAdminCardsResult(
  params: AdminCardsParams = {},
): AdminCardsResult {
  const page = normalizeFixturePage(params.page);
  const limit = normalizeFixtureLimit(params.limit);
  const search = params.search?.trim().toLowerCase() ?? "";
  const set = params.set?.trim().toLowerCase() ?? "";
  const condition = params.condition?.trim().toLowerCase() ?? "";
  const binder = params.binder?.trim().toLowerCase() ?? "";
  const sortBy = params.sortBy ?? "name";
  const sortDir = params.sortDir ?? "asc";

  const filtered = e2eFixtureAdminCards.filter((card) => {
    if (search && !card.name.toLowerCase().includes(search)) return false;
    if (set && card.setCode.toLowerCase() !== set) return false;
    if (condition && card.condition.toLowerCase() !== condition) return false;
    if (binder && card.binder.toLowerCase() !== binder) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortBy === "price") {
      cmp = (a.price ?? -1) - (b.price ?? -1);
    } else if (sortBy === "quantity") {
      cmp = a.quantity - b.quantity;
    } else {
      cmp = a.name.localeCompare(b.name);
    }
    return sortDir === "desc" ? -cmp : cmp;
  });

  const start = (page - 1) * limit;
  const cards = sorted.slice(start, start + limit);
  const totalPages = Math.max(1, Math.ceil(filtered.length / limit));

  return {
    cards,
    total: filtered.length,
    page,
    limit,
    totalPages,
  };
}

export const e2eFixtureAdminDashboardStats: AdminDashboardStats = {
  inventory: {
    uniqueCards: 5,
    totalQuantity: 11,
    totalValue: 36.75,
    lowStockCount: 0,
    missingPriceCount: 0,
  },
  breakdowns: {
    bySet: [{ setCode: "e2e", quantity: 11, uniqueCards: 5, value: 36.75 }],
    byColor: [
      { color: "U", quantity: 4, uniqueCards: 1, value: 8 },
      { color: "R", quantity: 3, uniqueCards: 1, value: 10.5 },
      { color: "C", quantity: 4, uniqueCards: 3, value: 18.25 },
    ],
    byRarity: [
      { rarity: "uncommon", quantity: 8, uniqueCards: 4, value: 26.25 },
      { rarity: "common", quantity: 3, uniqueCards: 1, value: 10.5 },
    ],
    byBinder: [
      { binder: "trade-box", quantity: 4, uniqueCards: 1, value: 8 },
      { binder: "a02", quantity: 3, uniqueCards: 1, value: 10.5 },
      { binder: "b01", quantity: 2, uniqueCards: 1, value: 8.5 },
      { binder: "b02", quantity: 1, uniqueCards: 1, value: 3.25 },
      { binder: "b03", quantity: 1, uniqueCards: 1, value: 6.5 },
    ],
  },
};

const e2eFixtureAuditEntries: AdminAuditEntriesResult["entries"] = [
  {
    id: 2,
    action: "order.status_update",
    actorEmail: "admin@example.com",
    targetType: "order",
    targetId: "ORD-E2E-0001",
    targetCount: 1,
    metadata: { status: "confirmed", orderRef: "ORD-E2E-0001" },
    createdAt: "2026-05-24T16:30:00.000Z",
  },
  {
    id: 1,
    action: "inventory.import_commit",
    actorEmail: "admin@example.com",
    targetType: "import",
    targetId: "fixture-import-001",
    targetCount: 5,
    metadata: {
      selectedBinders: ["a02", "b01", "b02", "b03", "trade-box"],
      totalBindersInExport: 5,
      scopedReplaceCounts: {
        before: { a02: 0, b01: 0, b02: 0, b03: 0, "trade-box": 0 },
        after: { a02: 1, b01: 1, b02: 1, b03: 1, "trade-box": 1 },
        deletedFromUnselected: 0,
      },
      totalCardsAfterImport: 5,
      newBindersInExport: ["a02", "b01", "b02", "b03", "trade-box"],
      missingBindersFromExport: [],
    },
    createdAt: "2026-05-24T15:45:00.000Z",
  },
];

export function getE2eFixtureAdminAuditEntries(
  params: AdminAuditEntriesParams = {},
): AdminAuditEntriesResult {
  const page = normalizeFixturePage(params.page);
  const limit = normalizeFixtureLimit(params.limit);
  const start = (page - 1) * limit;
  const entries = e2eFixtureAuditEntries.slice(start, start + limit);
  return {
    entries,
    total: e2eFixtureAuditEntries.length,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(e2eFixtureAuditEntries.length / limit)),
  };
}

const e2eFixtureImportHistoryEntries: ImportHistoryResult["entries"] = [
  {
    id: 1,
    actorEmail: "admin@example.com",
    fileNames: ["wiko-e2e-binders.csv"],
    fileCount: 1,
    parsedRows: 5,
    skippedRows: 0,
    insertedCards: 5,
    metadata: { selectedBinders: ["a02", "b01", "b02", "b03", "trade-box"] },
    committedAt: "2026-05-24T15:45:00.000Z",
  },
];

export function getE2eFixtureImportHistory(
  params: { page?: number; limit?: number } = {},
): ImportHistoryResult {
  const page = normalizeFixturePage(params.page);
  const limit = normalizeFixtureLimit(params.limit);
  const start = (page - 1) * limit;
  const entries = e2eFixtureImportHistoryEntries.slice(start, start + limit);
  return {
    entries,
    total: e2eFixtureImportHistoryEntries.length,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(e2eFixtureImportHistoryEntries.length / limit)),
  };
}

const e2eFixtureCardImage =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='336' viewBox='0 0 240 336'%3E%3Crect width='240' height='336' rx='18' fill='%23211635'/%3E%3Crect x='18' y='18' width='204' height='300' rx='12' fill='%23f2d071'/%3E%3Ctext x='120' y='168' dominant-baseline='middle' text-anchor='middle' font-family='serif' font-size='24' fill='%23211635'%3EWiko%3C/text%3E%3C/svg%3E";

export const e2eFixtureManaBoxRemovalReport: ManaBoxRemovalReport = {
  generatedAt: "2026-05-24T17:00:00.000Z",
  rows: [
    {
      key: "e2e|150|normal|near_mint",
      name: "Lightning Bolt",
      setCode: "e2e",
      setName: "E2E Masters",
      collectorNumber: "150",
      finish: "normal",
      condition: "near_mint",
      quantity: 2,
      totalValue: 7,
      orderRefs: ["ORD-E2E-0001"],
      orderItemIds: [101],
      binders: ["a02"],
      boxBreakdown: [
        {
          box: "a02",
          quantity: 2,
          orderRefs: ["ORD-E2E-0001"],
          orderItemIds: [101],
        },
      ],
      statuses: ["pending"],
      firstSoldAt: "2026-05-24T16:00:00.000Z",
      lastSoldAt: "2026-05-24T16:00:00.000Z",
      imageUrl: e2eFixtureCardImage,
    },
    {
      key: "e2e|001|foil|near_mint",
      name: "Sol Ring",
      setCode: "e2e",
      setName: "E2E Masters",
      collectorNumber: "001",
      finish: "foil",
      condition: "near_mint",
      quantity: 1,
      totalValue: 4.25,
      orderRefs: ["ORD-E2E-0001"],
      orderItemIds: [102],
      binders: ["b01"],
      boxBreakdown: [
        {
          box: "b01",
          quantity: 1,
          orderRefs: ["ORD-E2E-0001"],
          orderItemIds: [102],
        },
      ],
      statuses: ["pending"],
      firstSoldAt: "2026-05-24T16:00:00.000Z",
      lastSoldAt: "2026-05-24T16:00:00.000Z",
      imageUrl: e2eFixtureCardImage,
    },
    {
      key: "e2e|045|normal|lightly_played",
      name: "Counterspell",
      setCode: "e2e",
      setName: "E2E Masters",
      collectorNumber: "045",
      finish: "normal",
      condition: "lightly_played",
      quantity: 1,
      totalValue: 2,
      orderRefs: ["ORD-E2E-0002"],
      orderItemIds: [103],
      binders: ["trade-box"],
      boxBreakdown: [
        {
          box: "trade-box",
          quantity: 1,
          orderRefs: ["ORD-E2E-0002"],
          orderItemIds: [103],
        },
      ],
      statuses: ["confirmed"],
      firstSoldAt: "2026-05-24T15:00:00.000Z",
      lastSoldAt: "2026-05-24T15:00:00.000Z",
      imageUrl: e2eFixtureCardImage,
    },
  ],
  totalRows: 3,
  totalQuantity: 4,
  totalValue: 13.25,
  orderCount: 2,
  lastMarkedAt: "2026-05-23T10:00:00.000Z",
  lastMarkedBy: "admin@example.com",
};

export const e2eFixtureAdminHealthSnapshot: AdminHealthSnapshot = {
  database: "ok",
  lastOrderAt: "2026-05-24T16:00:00.000Z",
  lastImportAt: "2026-05-24T15:45:00.000Z",
  lastAuditAt: "2026-05-24T16:30:00.000Z",
  lastPriceRefreshAt: "2026-05-24T14:00:00.000Z",
};

export const e2eFixtureAdminOrders: AdminOrdersResult = {
  page: 1,
  limit: 25,
  total: 2,
  totalPages: 1,
  orders: [
    {
      id: "ORD-E2E-0001",
      buyerName: "Alex Buyer",
      buyerEmail: "alex@example.com",
      totalItems: 3,
      totalPrice: 11.25,
      status: "pending",
      createdAt: "2026-05-24T16:00:00.000Z",
      binders: ["a02", "b01"],
      lineCount: 2,
      previewItems: ["Lightning Bolt", "Sol Ring"],
    },
    {
      id: "ORD-E2E-0002",
      buyerName: "Casey Collector",
      buyerEmail: "casey@example.com",
      totalItems: 1,
      totalPrice: 2,
      status: "confirmed",
      createdAt: "2026-05-24T15:00:00.000Z",
      binders: ["trade-box"],
      lineCount: 1,
      previewItems: ["Counterspell"],
    },
  ],
};

export const e2eFixtureAdminOrderCounts: AdminOrderStatusCounts = {
  all: 2,
  queue: 2,
  pending: 1,
  confirmed: 1,
  completed: 0,
  cancelled: 0,
};

export const e2eFixtureAdminOrderDetails: AdminOrderDetail[] = [
  {
    orderRef: "ORD-E2E-0001",
    buyerName: "Alex Buyer",
    buyerEmail: "alex@example.com",
    buyerPhone: null,
    message: "Please hold for pickup.",
    adminNote: null,
    totalItems: 3,
    totalPrice: 11.25,
    status: "pending",
    createdAt: "2026-05-24T16:00:00.000Z",
    items: [
      {
        cardId: "e2e-150-normal-near_mint::a02",
        name: "Lightning Bolt",
        setName: "E2E Masters",
        setCode: "e2e",
        collectorNumber: "150",
        condition: "near_mint",
        price: 3.5,
        quantity: 2,
        lineTotal: 7,
        imageUrl: null,
        binder: "a02",
      },
      {
        cardId: "e2e-001-foil-near_mint::b01",
        name: "Sol Ring",
        setName: "E2E Masters",
        setCode: "e2e",
        collectorNumber: "001",
        condition: "near_mint",
        price: 4.25,
        quantity: 1,
        lineTotal: 4.25,
        imageUrl: null,
        binder: "b01",
      },
    ],
  },
  {
    orderRef: "ORD-E2E-0002",
    buyerName: "Casey Collector",
    buyerEmail: "casey@example.com",
    buyerPhone: null,
    adminNote: null,
    totalItems: 1,
    totalPrice: 2,
    status: "confirmed",
    createdAt: "2026-05-24T15:00:00.000Z",
    items: [
      {
        cardId: "e2e-045-normal-lightly_played::trade-box",
        name: "Counterspell",
        setName: "E2E Masters",
        setCode: "e2e",
        collectorNumber: "045",
        condition: "lightly_played",
        price: 2,
        quantity: 1,
        lineTotal: 2,
        imageUrl: null,
        binder: "trade-box",
      },
    ],
  },
];

export function getE2eFixtureAdminOrderDetail(
  orderRef: string,
): AdminOrderDetail | null {
  return (
    e2eFixtureAdminOrderDetails.find((order) => order.orderRef === orderRef) ??
    null
  );
}

export const e2eFixtureOrderTimeline: OrderTimelineEvent[] = [
  {
    kind: "created",
    label: "Order created",
    at: "2026-05-24T16:00:00.000Z",
    actorEmail: null,
    metadata: {},
  },
  {
    kind: "status_update",
    label: "Marked pending",
    at: "2026-05-24T16:02:00.000Z",
    actorEmail: "admin@example.com",
    metadata: { status: "pending" },
  },
];
