import "server-only";

import {
  getCardsAggregated,
  getCardsMeta,
  getRecentlyAddedCards,
} from "@/db/queries";
import {
  e2eFixtureCards,
  e2eFixtureMeta,
  e2eFixturesEnabled,
} from "@/lib/e2e-fixtures";
import { toPublicCards } from "@/lib/public-card";
import type { CardData, PublicCard } from "@/lib/types";

export type StorefrontData = {
  cards: PublicCard[];
  meta: CardData["meta"];
};

function sortByNewest(cards: PublicCard[]): PublicCard[] {
  return [...cards].sort((a, b) => {
    const aTime = Date.parse(a.createdAt ?? "");
    const bTime = Date.parse(b.createdAt ?? "");
    const safeATime = Number.isFinite(aTime) ? aTime : Number.NEGATIVE_INFINITY;
    const safeBTime = Number.isFinite(bTime) ? bTime : Number.NEGATIVE_INFINITY;
    return safeBTime - safeATime || a.name.localeCompare(b.name);
  });
}

export async function loadStorefrontData(): Promise<StorefrontData> {
  if (e2eFixturesEnabled()) {
    return { cards: e2eFixtureCards, meta: e2eFixtureMeta };
  }

  const [aggregatedAdmin, meta] = await Promise.all([
    getCardsAggregated(),
    getCardsMeta(),
  ]);

  // v1.3 Phase 20 D-05/D-06 + AGG-02: strip the admin-only `binders`
  // field BEFORE passing to the storefront. The PublicCard[] type guarantees
  // the storefront cannot accidentally read or render binder names.
  return { cards: toPublicCards(aggregatedAdmin), meta };
}

export async function loadRecentlyAddedStorefrontData(
  limit = 60,
): Promise<StorefrontData> {
  if (e2eFixturesEnabled()) {
    return { cards: sortByNewest(e2eFixtureCards).slice(0, limit), meta: e2eFixtureMeta };
  }

  const [aggregatedAdmin, meta] = await Promise.all([
    getRecentlyAddedCards(limit),
    getCardsMeta(),
  ]);

  return { cards: toPublicCards(aggregatedAdmin), meta };
}

export async function loadStorefrontDataSafely(
  loader: () => Promise<StorefrontData>,
  logPrefix: string,
): Promise<StorefrontData | null> {
  try {
    return await loader();
  } catch (error) {
    console.error(`[${logPrefix}] Database error:`, error);
    return null;
  }
}
