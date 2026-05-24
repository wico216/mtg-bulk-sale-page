import type {
  AdminOrdersResult,
  AdminOrderStatusCounts,
} from "@/db/orders";
import type { CardData, PublicCard } from "@/lib/types";

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
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z",
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
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z",
  },
];

export const e2eFixtureMeta: CardData["meta"] = {
  lastUpdated: "2026-05-23T00:00:00.000Z",
  totalCards: e2eFixtureCards.reduce((sum, card) => sum + card.quantity, 0),
  totalSkipped: 0,
  totalMissingPrices: 0,
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
