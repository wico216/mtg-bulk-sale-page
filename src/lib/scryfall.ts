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
