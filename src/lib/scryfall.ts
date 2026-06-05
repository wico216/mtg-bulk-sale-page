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

  const url = `https://api.scryfall.com/cards/${encodeURIComponent(setCode.toLowerCase())}/${encodeURIComponent(collectorNumber)}`;

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
// Up to 75 identifiers per POST. v1.3.2 reduces concurrency from 8 to 4 and
// serializes concurrent batches through a true critical-section gate (a chained
// promise) so we never burst above Scryfall's documented ~10 req/sec ceiling.
// Manabox CSV exports already carry the Scryfall UUID per row, so this skips
// the (setCode, collectorNumber) name-lookup layer entirely.
const COLLECTION_BATCH_SIZE = 75;
const COLLECTION_CONCURRENCY = 4;
// v1.3.2 — empirically, sustained ≥6 req/sec to /cards/collection earns a 429
// with Retry-After:60 from Scryfall every 25-30 successful requests. 250ms
// minimum spacing → ~4 req/sec sustained, which is well under the trigger
// threshold AND amortizes nicely: 75 cards/batch × 4 batches/sec = 300
// cards/sec, so a 7,700-unique-id cold-cache enrichment finishes in ~26s.
// The per-card endpoint keeps RATE_LIMIT_MS=120 because it's only used as a
// fallback for legacy CSVs (≤200 rows in practice) and the single-card load
// pattern is well under any burst threshold.
const COLLECTION_RATE_LIMIT_MS = 250;

interface ScryfallCardWithId extends ScryfallCard {
  id?: string;
}

// v1.3.2 — true critical-section gate. Each call to `acquireGate` chains onto
// the previous gate's resolution, then sleeps COLLECTION_RATE_LIMIT_MS before
// resolving the next caller. Under N concurrent callers this guarantees the
// i-th request fires no earlier than `i * COLLECTION_RATE_LIMIT_MS` after the
// first — exactly the serialization the broken `lastRequestTime` check in
// v1.3.1 was supposed to provide (it was a no-op because 8 concurrent callers
// all read the same `lastRequestTime`, all passed the elapsed-check, and all
// fired their requests in parallel).
let gateChain: Promise<void> = Promise.resolve();
function acquireGate(): Promise<void> {
  const next = gateChain.then(() => sleep(COLLECTION_RATE_LIMIT_MS));
  // Swallow rejections so a single failing waiter doesn't poison the chain.
  gateChain = next.catch(() => undefined);
  return next;
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
      // v1.3.2 — serialize this batch behind every prior in-flight batch via
      // the gate chain. Replaces the v1.3.1 read-then-write `lastRequestTime`
      // check which was a no-op under concurrency (8 callers read the same
      // value, all passed the elapsed check, all fired in parallel).
      await acquireGate();

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
 * Optional callback invoked after each batch resolves. `batchCardCount` is
 * the number of Scryfall IDs in the batch that just completed (whether the
 * Scryfall API returned them or not — it represents PROGRESS not RESOLUTION).
 * Used by `enrichCards` to drive the import-preview NDJSON progress stream
 * during the batch-fetch phase, so the UI is never silent for >2s.
 */
export interface FetchCollectionOptions {
  onBatchComplete?: (batchCardCount: number) => void;
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
 *
 * v1.3.2 — accepts `opts.onBatchComplete` so callers can render incremental
 * progress as batches resolve (the v1.3.1 implementation was silent until the
 * entire batch fetch resolved, which is up to 30s wall-time even on the happy
 * path for a 12,471-row Manabox export).
 */
export async function fetchCardsByScryfallIds(
  ids: string[],
  opts: FetchCollectionOptions = {},
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

  // Process batches in concurrent waves (COLLECTION_CONCURRENCY=4). Within a
  // wave, batches still serialize through `acquireGate()` so we get a steady
  // ~8 req/sec instead of bursting 4 in <100ms. The Promise.all join is
  // primarily useful for amortizing network latency variance.
  for (let i = 0; i < batches.length; i += COLLECTION_CONCURRENCY) {
    const wave = batches.slice(i, i + COLLECTION_CONCURRENCY);
    const responses = await Promise.all(
      wave.map(async (batch) => {
        const cards = await fetchCollectionBatch(batch);
        // Fire batch-complete progress callback as each batch resolves, so the
        // route handler can emit a progress NDJSON line for the operator UI.
        opts.onBatchComplete?.(batch.length);
        return cards;
      }),
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
