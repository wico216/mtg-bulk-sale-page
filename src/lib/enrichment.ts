import type { InventoryRow, Finish, ScryfallCard } from "./types";
import { fetchCard, fetchCardsByScryfallIds } from "./scryfall";

interface CardImageUrls {
  frontImageUrl: string | null;
  backImageUrl: string | null;
}

/**
 * Extract storefront image URLs from a Scryfall card.
 * Double-faced cards store each side under card_faces instead of image_uris.
 */
function getImageUrls(card: ScryfallCard): CardImageUrls {
  if (card.image_uris) {
    return {
      frontImageUrl: card.image_uris.normal,
      backImageUrl: null,
    };
  }

  const frontImageUrl = card.card_faces?.[0]?.image_uris?.normal ?? null;
  const backImageUrl = card.card_faces?.[1]?.image_uris?.normal ?? null;
  return { frontImageUrl, backImageUrl };
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
 * Extract a searchable Scryfall type line.
 * Double-faced cards may only expose per-face type lines; joining them keeps
 * both faces searchable without adding another public card shape.
 */
function getTypeLine(card: ScryfallCard): string | null {
  if (card.type_line) {
    return card.type_line;
  }

  if (card.card_faces) {
    const typeLines = card.card_faces
      .map((face) => face.type_line)
      .filter((typeLine): typeLine is string => !!typeLine);
    return typeLines.length > 0 ? typeLines.join(" // ") : null;
  }

  return null;
}

function parseManaCostValue(manaCost: string): number {
  const symbols = manaCost.match(/\{([^}]+)\}/g) ?? [];
  return symbols.reduce((total, symbol) => {
    const raw = symbol.slice(1, -1);
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) return total + numeric;
    if (raw === "X" || raw === "Y" || raw === "Z") return total;
    const hybridNumeric = Number(raw.split("/")[0]);
    if (Number.isFinite(hybridNumeric)) return total + hybridNumeric;
    return total + 1;
  }, 0);
}

function getManaValue(card: ScryfallCard): number | null {
  if (typeof card.cmc === "number") {
    return card.cmc;
  }

  const faceValues =
    card.card_faces
      ?.map((face) =>
        typeof face.mana_cost === "string"
          ? parseManaCostValue(face.mana_cost)
          : null,
      )
      .filter((value): value is number => value != null) ?? [];

  return faceValues.length > 0 ? Math.max(...faceValues) : null;
}

/**
 * Extract the raw Scryfall mana_cost string (e.g. "{1}{R}", "{X}{W}").
 *
 * Single-faced cards: returned verbatim from `card.mana_cost`.
 * Double-faced cards: joined as "<front> // <back>" so each face's cost is
 *   preserved (mirrors Scryfall's own "{2}{B} // {3}{B}" notation). The
 *   admin renderer can split on " // " and treat each side independently.
 * Returns `null` only when neither the card nor any face supplies a
 *   mana_cost — typical for lands ({} is empty-string, not null).
 */
function getManaCost(card: ScryfallCard): string | null {
  if (typeof card.mana_cost === "string") {
    return card.mana_cost;
  }
  const faceCosts =
    card.card_faces
      ?.map((face) =>
        typeof face.mana_cost === "string" ? face.mana_cost : null,
      )
      .filter((value): value is string => value !== null) ?? [];
  return faceCosts.length > 0 ? faceCosts.join(" // ") : null;
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
export function getPrice(
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
   * Invoked once per card (processed OR skipped) in strict ascending order
   * during the post-batch per-card loop, AND additionally once per batch
   * during the upstream `/cards/collection` fetch phase (v1.3.2). The
   * batch-phase callbacks fire with `done` increasing in 75-card increments
   * (the Scryfall batch size) so the UI never sees a >2s silent prefix.
   *
   * The final per-card loop preserves the v1.3.0 strict-ascending invariant:
   * exactly `cards.length` calls, monotone non-decreasing, ending at
   * `(cards.length, cards.length)`.
   */
  onProgress?: (done: number, total: number) => void;
  /**
   * v1.3.2 — optional abort signal. When the route handler's request is
   * aborted (client disconnects, page navigation, etc.), the per-card loop
   * polls this signal and bails out cleanly without making more Scryfall
   * calls. The batch-fetch phase already started before any abort can land,
   * but the per-card fallback (rows without a Scryfall UUID) and any future
   * sequential phase will respect it. This stops wasted compute and
   * Scryfall rate-limit consumption on stage-1 stream halts.
   */
  signal?: AbortSignal;
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
 *
 * v1.3.2 — Bug fixes on top of v1.3.1:
 *   1. Batch fetch now drives `onProgress` as each /cards/collection batch
 *      resolves (every ~120-1000ms) instead of being silent until the
 *      entire batch fetch completes. The route handler's NDJSON stream
 *      therefore emits a progress line every ~1s during the batch phase,
 *      which prevents the operator UI from appearing stuck at 0%.
 *   2. Concurrent batches are now serialized through a true critical-section
 *      gate (the v1.3.1 module-level `lastRequestTime` check was a no-op
 *      under concurrency — all 8 wave-mates read the same value and burst
 *      together, triggering Scryfall 429s with Retry-After:60 every 3-4
 *      waves). See `acquireGate` in `src/lib/scryfall.ts`.
 *   3. Per-card fallback loop polls `opts.signal` so client disconnects
 *      stop wasting compute + Scryfall budget.
 *
 * `onProgress` ordering invariant from v1.3.0 is preserved for the per-card
 * phase: callbacks fire in strict ascending order from `(0+1, cards.length)`
 * through `(cards.length, cards.length)`, exactly `cards.length` times. The
 * batch-phase callbacks fire BEFORE the per-card phase and may report any
 * `done` value in `[0, cards.length]`; the per-card phase then re-asserts
 * monotonicity from the start of its own loop.
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
  //
  // v1.3.2 — drive onProgress as batches resolve so the UI never sees a
  // multi-minute silent prefix. We cap the reported `done` value at
  // cards.length - 1 because the per-card loop below will fire the final
  // `(cards.length, cards.length)` callback.
  const idsToFetch = cards
    .map((c) => c.scryfallId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  let batchDoneEstimate = 0;
  const batchMap =
    idsToFetch.length > 0
      ? await fetchCardsByScryfallIds(idsToFetch, {
          onBatchComplete: (batchCardCount) => {
            batchDoneEstimate = Math.min(
              batchDoneEstimate + batchCardCount,
              Math.max(0, cards.length - 1),
            );
            opts.onProgress?.(batchDoneEstimate, cards.length);
          },
        })
      : new Map<string, ScryfallCard>();

  for (let i = 0; i < cards.length; i++) {
    // v1.3.2 — bail out if the client disconnected mid-loop.
    if (opts.signal?.aborted) break;

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

    const imageUrls = getImageUrls(scryfallData);
    card.imageUrl = imageUrls.frontImageUrl;
    card.backImageUrl = imageUrls.backImageUrl;
    card.price = getPrice(scryfallData.prices, card.finish);
    card.colorIdentity = scryfallData.color_identity;
    card.oracleText = getOracleText(scryfallData);
    card.typeLine = getTypeLine(scryfallData);
    card.manaCost = getManaCost(scryfallData);
    card.manaValue = getManaValue(scryfallData);

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
