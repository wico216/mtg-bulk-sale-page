import type { Card, ScryfallCard } from "./types";
import { fetchCard } from "./scryfall";

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
 * Extract USD price with fallback chain: usd -> usd_foil -> usd_etched.
 * Scryfall returns prices as strings like "16.05".
 */
function getPrice(prices: ScryfallCard["prices"]): number | null {
  const raw = prices.usd ?? prices.usd_foil ?? prices.usd_etched;

  if (raw == null) {
    return null;
  }

  const parsed = parseFloat(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

export interface EnrichmentStats {
  processed: number;
  skipped: number;
  missingPrices: number;
}

export interface EnrichmentResult {
  cards: Card[];
  stats: EnrichmentStats;
}

/**
 * Enrich parsed Card records with Scryfall data (image, price, color identity).
 * Cards not found on Scryfall are excluded from output.
 * Processes sequentially to respect Scryfall rate limits.
 */
export async function enrichCards(cards: Card[]): Promise<EnrichmentResult> {
  const enriched: Card[] = [];
  const stats: EnrichmentStats = {
    processed: 0,
    skipped: 0,
    missingPrices: 0,
  };

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const scryfallData = await fetchCard(card.setCode, card.collectorNumber);

    if (!scryfallData) {
      stats.skipped++;
      continue;
    }

    card.imageUrl = getImageUrl(scryfallData);
    card.price = getPrice(scryfallData.prices);
    card.colorIdentity = scryfallData.color_identity;
    card.oracleText = getOracleText(scryfallData);

    if (card.price === null) {
      stats.missingPrices++;
    }

    enriched.push(card);
    stats.processed++;

    if ((i + 1) % 25 === 0) {
      console.log(`Enriching: ${i + 1}/${cards.length} cards processed...`);
    }
  }

  return { cards: enriched, stats };
}
