import type { InventoryRow, Finish, ScryfallCard } from "./types";
import { fetchCard, fetchCardsByScryfallIds } from "./scryfall";

/**
 * Extract the normal image URL from a Scryfall card.
 * Handles double-faced cards by falling back to card_faces[0].
 */
function getImageUrl(card: ScryfallCard): string | null {
  if (card.image_uris) {
    return card.image_uris.normal;
  }

  // Double-faced cards have no top-level image_uris
  const frontFace = card.card_faces?.[0];
  if (frontFace?.image_uris?.normal) {
    return frontFace.image_uris.normal;
  }

  return null;
}

/**
 * Extract oracle rules text from a Scryfall card.
 * Handles double-faced cards by joining oracle text from each face.
 */
function getOracleText(card: ScryfallCard): string | null {
  if (card.oracle_text) {
    return card.oracle_text;
  }

  // Double-faced cards store oracle text per face
  if (card.card_faces) {
    const texts = card.card_faces
      .map((face) => face.oracle_text)
      .filter((text): text is string => !!text);
    return texts.length > 0 ? texts.join(" // ") : null;
  }

  return null;
}

/**
 * Extract USD price preferring the printing finish that matches the listing.
 *
 * Phase 17 D-08 — three-branch ladder per finish enum value:
 *   - 'etched' rows prefer `usd_etched`, then fall back to `usd_foil`
 *     (etched is structurally a foil treatment), then to `usd` as a last
 *     resort. **This is the v1.2 latent bug fix:** before Phase 17 every
 *     etched card was treated as `foil: false` and silently took the
 *     non-foil `usd` price, mispricing the 11 etched cards in the
 *     operator's collection (Wrath of God, Cultist of the Absolute,
 *     Master Chef, Tor Wauki the Younger, Jasmine Boreal of the Seven, …).
 *   - 'foil' rows prefer `usd_foil`, then `usd_etched`, then `usd`
 *     (preserves the existing v1.2 foil-first fallback ladder verbatim).
 *   - 'normal' rows prefer `usd`, then `usd_foil`, then `usd_etched`
 *     (preserves the existing v1.2 normal-first fallback ladder verbatim).
 *
 * Scryfall returns prices as strings like "16.05".
 */
function getPrice(
  prices: ScryfallCard["prices"],
  finish: Finish,
): number | null {
  const raw =
    finish === "etched"
      ? prices.usd_etched ?? prices.usd_foil ?? prices.usd
      : finish === "foil"
        ? prices.usd_foil ?? prices.usd_etched ?? prices.usd
        : prices.usd ?? prices.usd_foil ?? prices.usd_etched;

  if (raw == null) return null;
  const parsed = parseFloat(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

export interface EnrichmentStats {
  processed: number;
  skipped: number;
  missingPrices: number;
}

/**
 * A card that could not be enriched because Scryfall returned no match.
 * Surfaced to callers (admin import preview) so skipped cards can be shown.
 */
export interface SkippedCard {
  setCode: string;
  collectorNumber: string;
  name: string;
  reason: string;
}

export interface EnrichmentResult {
  cards: InventoryRow[];
  stats: EnrichmentStats;
  /** Cards whose Scryfall lookup returned null. Empty array when all resolved. */
  scryfallMisses: SkippedCard[];
}

/** Optional knobs for enrichCards -- backward compatible via default `{}`. */
export interface EnrichmentOptions {
  /**
   * Invoked once per card (processed OR skipped) in strict ascending order.
   * The first argument is the number of cards processed so far (1-based) and
   * the second is the total. Use this to drive a progress bar in the UI.
   */
  onProgress?: (done: number, total: number) => void;
}

/**
 * Enrich parsed InventoryRow records with Scryfall data (image, price, color
 * identity). Rows not found on Scryfall are excluded from `cards[]` and
 * recorded in `scryfallMisses[]`.
 *
 * v1.3.1 — Hot path uses Scryfall's `/cards/collection` batch endpoint via
 * `fetchCardsByScryfallIds` for any row that has a `scryfallId` from the
 * Manabox CSV (the modern-export case). Rows without a Scryfall UUID fall
 * back to the legacy sequential `fetchCard(setCode, collectorNumber)` path.
 * For a 12,749-row real Manabox export this drops enrichment wall-time from
 * ~25-30 minutes to a few seconds, which keeps the import preview's NDJSON
 * stream alive under the Vercel function timeout.
 *
 * `onProgress` ordering invariant from v1.3.0 is preserved: callbacks fire
 * in strict ascending order, once per row, exactly `cards.length` times.
 */
export async function enrichCards(
  cards: InventoryRow[],
  opts: EnrichmentOptions = {},
): Promise<EnrichmentResult> {
  const enriched: InventoryRow[] = [];
  const scryfallMisses: SkippedCard[] = [];
  const stats: EnrichmentStats = {
    processed: 0,
    skipped: 0,
    missingPrices: 0,
  };

  // v1.3.1 — pre-fetch all rows that carry a Scryfall UUID in one batched
  // collection call. Rows without a UUID fall through to the legacy
  // per-card lookup below.
  const idsToFetch = cards
    .map((c) => c.scryfallId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const batchMap =
    idsToFetch.length > 0
      ? await fetchCardsByScryfallIds(idsToFetch)
      : new Map<string, ScryfallCard>();

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    let scryfallData: ScryfallCard | null = null;
    if (card.scryfallId && batchMap.has(card.scryfallId)) {
      scryfallData = batchMap.get(card.scryfallId)!;
    } else {
      // Legacy fallback for rows where the CSV didn't include a Scryfall ID,
      // OR rows where the batch endpoint returned not_found.
      scryfallData = await fetchCard(card.setCode, card.collectorNumber);
    }

    if (!scryfallData) {
      scryfallMisses.push({
        setCode: card.setCode,
        collectorNumber: card.collectorNumber,
        name: card.name,
        reason: "not found on Scryfall",
      });
      stats.skipped++;
      opts.onProgress?.(i + 1, cards.length);
      continue;
    }

    card.imageUrl = getImageUrl(scryfallData);
    card.price = getPrice(scryfallData.prices, card.finish);
    card.colorIdentity = scryfallData.color_identity;
    card.oracleText = getOracleText(scryfallData);

    if (card.price === null) {
      stats.missingPrices++;
    }

    enriched.push(card);
    stats.processed++;

    if ((i + 1) % 100 === 0) {
      console.log(`Enriching: ${i + 1}/${cards.length} cards processed...`);
    }

    opts.onProgress?.(i + 1, cards.length);
  }

  return { cards: enriched, stats, scryfallMisses };
}
