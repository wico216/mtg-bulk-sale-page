import type { ScryfallCard } from "./types";
import { getCached, setCache } from "./cache";

const RATE_LIMIT_MS = 100;

let lastRequestTime = 0;

/**
 * Enforce 100ms minimum delay between Scryfall API requests.
 */
async function rateLimitedFetch(url: string): Promise<Response> {
  const elapsed = Date.now() - lastRequestTime;

  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
  }

  lastRequestTime = Date.now();
  return fetch(url);
}

/**
 * Fetch a card from Scryfall by set code and collector number.
 * Returns cached data when available. Returns null for missing cards.
 */
export async function fetchCard(
  setCode: string,
  collectorNumber: string,
): Promise<ScryfallCard | null> {
  const cacheKey = `${setCode}-${collectorNumber}`;

  const cached = getCached<ScryfallCard>(cacheKey);
  if (cached) {
    return cached;
  }

  const url = `https://api.scryfall.com/cards/${setCode.toLowerCase()}/${collectorNumber}`;

  try {
    const response = await rateLimitedFetch(url);

    if (response.status === 404) {
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
    console.warn(`Scryfall API error for ${setCode}/${collectorNumber}:`, error);
    return null;
  }
}
