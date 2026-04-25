import fs from "node:fs";
import path from "node:path";

const CACHE_DIR = "data/cache/scryfall";
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry<T> {
  timestamp: number;
  data: T;
}

/**
 * Replace filesystem-unsafe characters with underscores.
 * Keeps alphanumeric and hyphens only.
 */
function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9-]/g, "_");
}

/**
 * Read a cached value by key. Returns null if not found or expired (24h TTL).
 */
export function getCached<T>(key: string): T | null {
  const filePath = path.join(CACHE_DIR, `${sanitizeKey(key)}.json`);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const entry: CacheEntry<T> = JSON.parse(raw);

    if (Date.now() - entry.timestamp > TTL_MS) {
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Write a value to cache with the current timestamp.
 *
 * Failures are swallowed: caching is an optimization, not correctness.
 * Vercel's serverless filesystem is read-only outside /tmp, so writes here
 * throw EROFS in production — without this guard, the catch in scryfall.ts
 * treats every fetched card as a Scryfall miss and the admin importer ends
 * up with zero cards to import.
 */
export function setCache<T>(key: string, data: T): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const filePath = path.join(CACHE_DIR, `${sanitizeKey(key)}.json`);
    const entry: CacheEntry<T> = { timestamp: Date.now(), data };
    fs.writeFileSync(filePath, JSON.stringify(entry), "utf-8");
  } catch {
    // intentionally non-fatal
  }
}
