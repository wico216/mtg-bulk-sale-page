import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  mockNotFound,
  mockResolveWBinderShareLink,
  mockGetPrivateWBinderCardsAggregated,
  mockGetPrivateWBinderCardsMeta,
} = vi.hoisted(() => ({
  mockNotFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  mockResolveWBinderShareLink: vi.fn(),
  mockGetPrivateWBinderCardsAggregated: vi.fn(),
  mockGetPrivateWBinderCardsMeta: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
}));
vi.mock("@/db/w-binder-share-links", () => ({
  resolveWBinderShareLink: mockResolveWBinderShareLink,
}));
vi.mock("@/db/queries", () => ({
  getPrivateWBinderCardsAggregated: mockGetPrivateWBinderCardsAggregated,
  getPrivateWBinderCardsMeta: mockGetPrivateWBinderCardsMeta,
}));

import SharedWBindersPage from "../page";

const meta = {
  lastUpdated: "2026-06-12T00:00:00.000Z",
  totalCards: 1,
  totalSkipped: 0,
  totalMissingPrices: 0,
};

const card = {
  id: "w01-eoe-001-normal-near_mint",
  name: "Preview Card",
  setCode: "eoe",
  setName: "Edge of Eternities",
  collectorNumber: "001",
  price: 1.25,
  condition: "near_mint",
  quantity: 1,
  colorIdentity: [],
  imageUrl: null,
  backImageUrl: null,
  oracleText: null,
  typeLine: "Creature",
  manaValue: null,
  rarity: "rare",
  finish: "normal",
  binder: "w01",
  binders: ["w01"],
  scryfallId: "preview-card",
  createdAt: "2026-06-12T00:00:00.000Z",
  updatedAt: "2026-06-12T00:00:00.000Z",
};

describe("/share/w-binders/[token] page", () => {
  beforeEach(() => {
    mockNotFound.mockClear();
    mockResolveWBinderShareLink.mockReset();
    mockGetPrivateWBinderCardsAggregated.mockReset();
    mockGetPrivateWBinderCardsMeta.mockReset();
  });

  it("resolves the token and scopes private W-binder queries to the link allow-list", async () => {
    mockResolveWBinderShareLink.mockResolvedValueOnce({
      id: 12,
      label: "Commander pod",
      scope: "w_binders",
      allowedBinders: ["w01"],
      createdByEmail: "admin@example.com",
      expiresAt: "2026-07-12T00:00:00.000Z",
      revokedAt: null,
      lastUsedAt: null,
      useCount: 1,
      createdAt: "2026-06-12T00:00:00.000Z",
    });
    mockGetPrivateWBinderCardsAggregated.mockResolvedValueOnce([card]);
    mockGetPrivateWBinderCardsMeta.mockResolvedValueOnce(meta);

    const element = await SharedWBindersPage({
      params: Promise.resolve({ token: "raw-token" }),
    });

    expect(mockResolveWBinderShareLink).toHaveBeenCalledWith("raw-token");
    expect(mockGetPrivateWBinderCardsAggregated).toHaveBeenCalledWith(["w01"]);
    expect(mockGetPrivateWBinderCardsMeta).toHaveBeenCalledWith(["w01"]);
    expect(element.props).toMatchObject({
      cards: [card],
      meta,
      linkLabel: "Commander pod",
      expiresAt: "2026-07-12T00:00:00.000Z",
    });
  });

  it("404s invalid, expired, or revoked tokens before loading private cards", async () => {
    mockResolveWBinderShareLink.mockResolvedValueOnce(null);

    await expect(
      SharedWBindersPage({ params: Promise.resolve({ token: "bad-token" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mockNotFound).toHaveBeenCalled();
    expect(mockGetPrivateWBinderCardsAggregated).not.toHaveBeenCalled();
    expect(mockGetPrivateWBinderCardsMeta).not.toHaveBeenCalled();
  });
});
