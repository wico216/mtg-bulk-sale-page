import type { ScryfallCard } from "./types";
import { getCached, setCache } from "./cache";

// 100ms is Scryfall's documented minimum; 120ms gives a small safety margin
// to reduce 429s under sustained sequential traffic (e.g. importing a fresh
// 600-card binder).
const RATE_LIMIT_MS = 120;
const MAX_RETRIES = 3;

let lastRequestTime = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
  return fetch(url);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a card from Scryfall by set code and collector number.
 *
 * Returns the card on 200, null on a definitive 404 (genuine "not on Scryfall"),
 * and retries transient failures (429, 5xx, network errors) with exponential
 * backoff. Returning null for transient failures previously caused real cards
 * to be silently dropped from imports as "not found on Scryfall."
 */
export async function fetchCard(
  setCode: string,
  collectorNumber: string,
): Promise<ScryfallCard | null> {
  const cacheKey = `${setCode}-${collectorNumber}`;
  const cached = getCached<ScryfallCard>(cacheKey);
  if (cached) return cached;

  const url = `https://api.scryfall.com/cards/${setCode.toLowerCase()}/${collectorNumber}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await rateLimitedFetch(url);

      if (response.status === 404) return null;

      if (response.status === 429 || response.status >= 500) {
        if (attempt < MAX_RETRIES) {
          const retryAfter = response.headers.get("retry-after");
          const retryAfterMs = retryAfter
            ? parseFloat(retryAfter) * 1000
            : NaN;
          const backoff = Number.isFinite(retryAfterMs)
            ? retryAfterMs
            : 250 * Math.pow(2, attempt); // 250, 500, 1000
          await sleep(backoff);
          continue;
        }
        console.warn(
          `Scryfall ${response.status} for ${setCode}/${collectorNumber} after ${MAX_RETRIES} retries`,
        );
        return null;
      }

      if (!response.ok) {
        console.warn(
          `Scryfall API warning: ${response.status} for ${setCode}/${collectorNumber}`,
        );
        return null;
      }

      const data: ScryfallCard = await response.json();
      setCache(cacheKey, data);
      return data;
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        await sleep(250 * Math.pow(2, attempt));
        continue;
      }
      console.warn(
        `Scryfall API error for ${setCode}/${collectorNumber} after ${MAX_RETRIES} retries:`,
        error,
      );
      return null;
    }
  }

  return null;
}

// v1.3.1 — Scryfall /cards/collection batch endpoint.
// Up to 75 identifiers per POST; we fire up to 8 batches in parallel.
// For the operator's 12,749-row real export this is roughly 170 batches in
// 22 concurrent waves -> ~3-5 seconds wall time vs ~25-30 minutes sequentially.
// Manabox CSV exports already carry the Scryfall UUID per row, so this skips
// the (setCode, collectorNumber) name-lookup layer entirely.
const COLLECTION_BATCH_SIZE = 75;
const COLLECTION_CONCURRENCY = 8;

interface ScryfallCardWithId extends ScryfallCard {
  id?: string;
}

async function fetchCollectionBatch(
  ids: string[],
): Promise<ScryfallCardWithId[]> {
  const url = "https://api.scryfall.com/cards/collection";
  const body = JSON.stringify({
    identifiers: ids.map((id) => ({ id })),
  });

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Same 120ms minimum gate as the per-card path so concurrent batches
      // serialize through the rate limiter and we never burst.
      const elapsed = Date.now() - lastRequestTime;
      if (elapsed < RATE_LIMIT_MS) {
        await sleep(RATE_LIMIT_MS - elapsed);
      }
      lastRequestTime = Date.now();

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (response.status === 429 || response.status >= 500) {
        if (attempt < MAX_RETRIES) {
          const retryAfter = response.headers.get("retry-after");
          const retryAfterMs = retryAfter
            ? parseFloat(retryAfter) * 1000
            : NaN;
          const backoff = Number.isFinite(retryAfterMs)
            ? retryAfterMs
            : 250 * Math.pow(2, attempt);
          await sleep(backoff);
          continue;
        }
        console.warn(
          `Scryfall /cards/collection ${response.status} after ${MAX_RETRIES} retries`,
        );
        return [];
      }

      if (!response.ok) {
        console.warn(
          `Scryfall /cards/collection warning: ${response.status}`,
        );
        return [];
      }

      const json = (await response.json()) as {
        data?: ScryfallCardWithId[];
        not_found?: Array<{ id?: string }>;
      };
      return Array.isArray(json.data) ? json.data : [];
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        await sleep(250 * Math.pow(2, attempt));
        continue;
      }
      console.warn(
        `Scryfall /cards/collection error after ${MAX_RETRIES} retries:`,
        error,
      );
      return [];
    }
  }

  return [];
}

/**
 * Batch-fetch Scryfall cards by their Scryfall UUIDs.
 *
 * Returns a Map keyed by Scryfall ID; ids that Scryfall returns as `not_found`
 * are simply absent from the Map (callers should `.has(id)` check). Uses the
 * shared 120ms rate-limit gate and the existing in-memory cache.
 *
 * Cache key is `id-${scryfallId}` (separate namespace from the per-card
 * `${setCode}-${collectorNumber}` cache used by `fetchCard`, so the two paths
 * do not collide).
 */
export async function fetchCardsByScryfallIds(
  ids: string[],
): Promise<Map<string, ScryfallCard>> {
  const result = new Map<string, ScryfallCard>();
  if (ids.length === 0) return result;

  // De-dup; pre-fill from cache.
  const unique = Array.from(new Set(ids)).filter((id) => id && id.length > 0);
  const uncached: string[] = [];
  for (const id of unique) {
    const cached = getCached<ScryfallCard>(`id-${id}`);
    if (cached) {
      result.set(id, cached);
    } else {
      uncached.push(id);
    }
  }

  if (uncached.length === 0) return result;

  // Chunk into batches of 75 (Scryfall's documented max per request).
  const batches: string[][] = [];
  for (let i = 0; i < uncached.length; i += COLLECTION_BATCH_SIZE) {
    batches.push(uncached.slice(i, i + COLLECTION_BATCH_SIZE));
  }

  // Process batches in concurrent waves (up to 8 in flight at once).
  for (let i = 0; i < batches.length; i += COLLECTION_CONCURRENCY) {
    const wave = batches.slice(i, i + COLLECTION_CONCURRENCY);
    const responses = await Promise.all(
      wave.map((batch) => fetchCollectionBatch(batch)),
    );
    for (const cards of responses) {
      for (const card of cards) {
        if (card.id) {
          result.set(card.id, card);
          setCache(`id-${card.id}`, card);
        }
      }
    }
  }

  return result;
}
