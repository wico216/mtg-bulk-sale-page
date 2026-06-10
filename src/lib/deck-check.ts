import { request as httpsRequest } from "node:https";
import type { Finish, PublicCard } from "@/lib/types";
import { fetchCardsByNames, fetchCardsByScryfallIds } from "@/lib/scryfall";

export type DeckSource = "text" | "moxfield" | "archidekt" | "manabox";
export type DeckSection = "main" | "commander" | "sideboard" | "maybeboard" | "companion";
export type DeckMatchStatus = "exact" | "alternate" | "available" | "missing";
export type DeckOptionMatchType = "exact" | "alternate" | "available";

export interface DeckCardRequest {
  id: string;
  name: string;
  quantity: number;
  section: DeckSection;
  rawLine?: string;
  setCode?: string;
  collectorNumber?: string;
  finish?: Finish;
  scryfallId?: string;
  oracleId?: string;
}

export interface ImportedDeck {
  source: DeckSource;
  sourceLabel: string;
  deckName?: string;
  cards: DeckCardRequest[];
  warnings: string[];
}

export interface DeckCheckInventoryIdentity {
  scryfallId?: string | null;
  oracleId?: string | null;
}

export interface DeckCheckOption {
  card: PublicCard;
  matchType: DeckOptionMatchType;
  reason: string;
  recommended: boolean;
  addQuantity: number;
}

export interface DeckCheckItem {
  request: DeckCardRequest;
  status: DeckMatchStatus;
  statusLabel: string;
  requestedPrintingLabel: string | null;
  options: DeckCheckOption[];
  recommendedCardId: string | null;
}

export interface DeckCheckSummary {
  requestedCards: number;
  requestedQuantity: number;
  matchedCards: number;
  exactCards: number;
  alternateCards: number;
  availableNameCards: number;
  missingCards: number;
  addableQuantity: number;
  estimatedTotal: number | null;
}

export interface DeckCheckResult {
  source: DeckSource;
  sourceLabel: string;
  deckName?: string;
  warnings: string[];
  summary: DeckCheckSummary;
  items: DeckCheckItem[];
}

const REQUEST_LIMIT = 250;
const KNOWN_URL_HOSTS = new Set([
  "moxfield.com",
  "www.moxfield.com",
  "archidekt.com",
  "www.archidekt.com",
  "manabox.app",
  "www.manabox.app",
]);

const SECTION_HEADINGS: Record<string, DeckSection> = {
  commander: "commander",
  commanders: "commander",
  main: "main",
  mainboard: "main",
  deck: "main",
  sideboard: "sideboard",
  side: "sideboard",
  maybeboard: "maybeboard",
  maybe: "maybeboard",
  companion: "companion",
  companions: "companion",
};

const CONDITION_RANK: Record<string, number> = {
  near_mint: 0,
  lightly_played: 1,
  moderately_played: 2,
  heavily_played: 3,
  damaged: 4,
};

const FINISH_RANK: Record<Finish, number> = {
  normal: 0,
  foil: 1,
  etched: 2,
};

function safeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function safeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function getPathValue(root: unknown, path: string[]): unknown {
  let current = root;
  for (const key of path) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function firstString(root: unknown, paths: string[][]): string | undefined {
  for (const path of paths) {
    const value = safeString(getPathValue(root, path));
    if (value) return value;
  }
  return undefined;
}

function normalizeSourceSection(value: unknown): DeckSection {
  if (typeof value === "string") {
    const key = value.trim().toLowerCase();
    return SECTION_HEADINGS[key] ?? "main";
  }
  if (Array.isArray(value)) {
    const joined = value.map((entry) => String(entry).toLowerCase()).join(" ");
    if (joined.includes("commander")) return "commander";
    if (joined.includes("sideboard")) return "sideboard";
    if (joined.includes("maybeboard")) return "maybeboard";
    if (joined.includes("companion")) return "companion";
  }
  return "main";
}

export function normalizeCardName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeSetCode(value: string | undefined): string | undefined {
  return value?.trim().toLowerCase() || undefined;
}

function normalizeCollectorNumber(value: string | undefined): string | undefined {
  return value?.trim().toLowerCase() || undefined;
}

function formatFinish(finish: Finish | undefined): string | null {
  if (!finish) return null;
  if (finish === "normal") return "Nonfoil";
  if (finish === "foil") return "Foil";
  return "Etched";
}

function inferFinish(value: string): Finish | undefined {
  const lower = value.toLowerCase();
  if (/\betched\b/.test(lower)) return "etched";
  if (/\bfoil\b|\*f\*|\[f\]/.test(lower)) return "foil";
  if (/\bnonfoil\b|\bnormal\b|\*nf\*|\[nf\]/.test(lower)) return "normal";
  return undefined;
}

function cleanDeckName(raw: string): string {
  return raw
    .replace(/\s+\*F\*\s*$/i, "")
    .replace(/\s+\[F\]\s*$/i, "")
    .replace(/\s+\[NF\]\s*$/i, "")
    .replace(/\s+foil\s*$/i, "")
    .replace(/\s+nonfoil\s*$/i, "")
    .replace(/\s+etched\s*$/i, "")
    .trim();
}

function parseDeckLine(line: string, section: DeckSection, index: number): DeckCardRequest | null {
  const trimmed = line
    .replace(/^[-*•]\s*/, "")
    .replace(/\s+\/\/.*$/, "")
    .trim();
  if (!trimmed) return null;

  const headingKey = trimmed.replace(/:$/, "").trim().toLowerCase();
  if (SECTION_HEADINGS[headingKey]) return null;
  if (/^(name|format|about|created|updated|tags?)\b/i.test(trimmed)) return null;

  const quantityMatch = trimmed.match(/^(?:(\d+)\s*x?\s+)(.+)$/i);
  const quantity = quantityMatch ? Math.max(1, Number(quantityMatch[1])) : 1;
  let rest = (quantityMatch ? quantityMatch[2] : trimmed).trim();
  const finish = inferFinish(rest);

  let setCode: string | undefined;
  let collectorNumber: string | undefined;

  // Common exports: "Counterspell (DMR) 45" or "Sol Ring (CMM) 400 *F*".
  const parenMatch = rest.match(/^(.*?)\s+\(([A-Za-z0-9_-]+)\)\s+([A-Za-z0-9★☆-]+)(?:\s+.*)?$/);
  if (parenMatch) {
    rest = parenMatch[1].trim();
    setCode = normalizeSetCode(parenMatch[2]);
    collectorNumber = normalizeCollectorNumber(parenMatch[3]);
  } else {
    // Other exports: "Counterspell [DMR#45]" / "Counterspell [DMR] 45".
    const bracketMatch = rest.match(/^(.*?)\s+\[([A-Za-z0-9_-]+)(?:[#\s]+([A-Za-z0-9★☆-]+))?\](?:\s+([A-Za-z0-9★☆-]+))?(?:\s+.*)?$/);
    if (bracketMatch) {
      rest = bracketMatch[1].trim();
      setCode = normalizeSetCode(bracketMatch[2]);
      collectorNumber = normalizeCollectorNumber(bracketMatch[3] ?? bracketMatch[4]);
    }
  }

  const name = cleanDeckName(rest);
  if (!name || /^\d+$/.test(name)) return null;

  return {
    id: `line-${index}`,
    name,
    quantity,
    section,
    rawLine: line,
    setCode,
    collectorNumber,
    finish,
  };
}

export function parseDeckText(input: string): DeckCardRequest[] {
  const lines = input.split(/\r?\n/);
  let section: DeckSection = "main";
  const cards: DeckCardRequest[] = [];

  for (const [index, rawLine] of lines.entries()) {
    const trimmed = rawLine.trim();
    const headingKey = trimmed.replace(/:$/, "").trim().toLowerCase();
    const nextSection = SECTION_HEADINGS[headingKey];
    if (nextSection) {
      section = nextSection;
      continue;
    }

    const card = parseDeckLine(rawLine, section, index);
    if (card) cards.push(card);
    if (cards.length >= REQUEST_LIMIT) break;
  }

  return dedupeRequests(cards);
}

function requestDedupeKey(card: DeckCardRequest): string {
  return [
    normalizeCardName(card.name),
    card.section,
    normalizeSetCode(card.setCode) ?? "",
    normalizeCollectorNumber(card.collectorNumber) ?? "",
    card.finish ?? "",
    card.scryfallId?.toLowerCase() ?? "",
  ].join("::");
}

function dedupeRequests(cards: DeckCardRequest[]): DeckCardRequest[] {
  const merged = new Map<string, DeckCardRequest>();
  for (const card of cards) {
    const key = requestDedupeKey(card);
    const current = merged.get(key);
    if (current) {
      current.quantity += card.quantity;
    } else {
      merged.set(key, { ...card, id: `deck-${merged.size}` });
    }
  }
  return [...merged.values()];
}

function parseKnownUrl(input: string): URL | null {
  try {
    const url = new URL(input.trim());
    if (!/^https?:$/.test(url.protocol)) return null;
    if (!KNOWN_URL_HOSTS.has(url.hostname.toLowerCase())) return null;
    return url;
  } catch {
    return null;
  }
}

export function detectDeckSource(input: string): DeckSource {
  const url = parseKnownUrl(input);
  if (!url) return "text";
  const host = url.hostname.toLowerCase();
  if (host.includes("moxfield")) return "moxfield";
  if (host.includes("archidekt")) return "archidekt";
  if (host.includes("manabox")) return "manabox";
  return "text";
}

function externalFetchHeaders(): Record<string, string> {
  return {
    Accept: "application/json, text/plain;q=0.9, text/html;q=0.8",
    "User-Agent": "WikoSpellbinder/1.0 (+https://wikospellbinder.com)",
  };
}

async function fetchJsonViaNodeHttps(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        method: "GET",
        headers: externalFetchHeaders(),
        timeout: 20_000,
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const chunks: Buffer[] = [];
        let byteLength = 0;

        response.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          byteLength += buffer.length;
          if (byteLength > 5_000_000) {
            request.destroy(new Error("Deck source response is too large."));
            return;
          }
          chunks.push(buffer);
        });

        response.on("error", reject);
        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (status < 200 || status >= 300) {
            reject(new Error(`Deck source returned HTTP ${status}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error("Deck source returned invalid JSON."));
          }
        });
      },
    );

    request.on("timeout", () => request.destroy(new Error("Deck source request timed out.")));
    request.on("error", reject);
    request.end();
  });
}

async function fetchTextViaNodeHttps(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        method: "GET",
        headers: externalFetchHeaders(),
        timeout: 20_000,
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const chunks: Buffer[] = [];
        let byteLength = 0;

        response.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          byteLength += buffer.length;
          if (byteLength > 5_000_000) {
            request.destroy(new Error("Deck source response is too large."));
            return;
          }
          chunks.push(buffer);
        });

        response.on("error", reject);
        response.on("end", () => {
          if (status < 200 || status >= 300) {
            reject(new Error(`Deck source returned HTTP ${status}`));
            return;
          }
          resolve(Buffer.concat(chunks).toString("utf8"));
        });
      },
    );

    request.on("timeout", () => request.destroy(new Error("Deck source request timed out.")));
    request.on("error", reject);
    request.end();
  });
}

async function fetchJson(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, { headers: externalFetchHeaders() });
    if (response.ok) return response.json();
  } catch {
    // Fall through to the Node HTTPS client below. Some deck providers, notably
    // Moxfield behind Cloudflare, reject undici/global fetch but accept Node's
    // built-in HTTPS client with the same public API URL and headers.
  }

  return fetchJsonViaNodeHttps(url);
}

async function fetchText(url: string): Promise<string> {
  try {
    const response = await fetch(url, { headers: externalFetchHeaders() });
    if (response.ok) return response.text();
  } catch {
    // Fall through to the Node HTTPS client for parity with fetchJson.
  }

  return fetchTextViaNodeHttps(url);
}

function cardFromMoxfieldEntry(entry: unknown, section: DeckSection, index: number): DeckCardRequest | null {
  const cardRoot = getPathValue(entry, ["card"]) ?? entry;
  const name = firstString(cardRoot, [["name"], ["card", "name"]]);
  if (!name) return null;
  const quantity = safeNumber(getPathValue(entry, ["quantity"])) ?? 1;
  return {
    id: `moxfield-${section}-${index}`,
    name,
    quantity: Math.max(1, Math.trunc(quantity)),
    section,
    setCode: normalizeSetCode(firstString(cardRoot, [["set"], ["setCode"], ["set_code"]])),
    collectorNumber: normalizeCollectorNumber(
      firstString(cardRoot, [["cn"], ["collector_number"], ["collectorNumber"]]),
    ),
    finish: inferFinish(firstString(entry, [["finish"], ["printing"], ["foil"]]) ?? ""),
    scryfallId: firstString(cardRoot, [["scryfall_id"], ["scryfallId"], ["id"]]),
    oracleId: firstString(cardRoot, [["oracle_id"], ["oracleId"]]),
  };
}

function cardsFromMoxfieldJson(json: unknown): ImportedDeck {
  const deckName = firstString(json, [["name"], ["deck", "name"]]);
  const cards: DeckCardRequest[] = [];
  const sections: Array<[string, DeckSection]> = [
    ["commanders", "commander"],
    ["mainboard", "main"],
    ["sideboard", "sideboard"],
    ["maybeboard", "maybeboard"],
    ["companions", "companion"],
  ];

  for (const [key, section] of sections) {
    const bucket = getPathValue(json, [key]);
    const values = Array.isArray(bucket)
      ? bucket
      : bucket && typeof bucket === "object"
        ? Object.values(bucket as Record<string, unknown>)
        : [];
    values.forEach((entry, index) => {
      const card = cardFromMoxfieldEntry(entry, section, cards.length + index);
      if (card) cards.push(card);
    });
  }

  return {
    source: "moxfield",
    sourceLabel: "Moxfield",
    deckName,
    cards: dedupeRequests(cards).slice(0, REQUEST_LIMIT),
    warnings: [],
  };
}

function cardFromArchidektEntry(entry: unknown, index: number): DeckCardRequest | null {
  const cardRoot = getPathValue(entry, ["card"]) ?? entry;
  const edition = getPathValue(cardRoot, ["edition"]) ?? getPathValue(entry, ["edition"]);
  const name = firstString(cardRoot, [
    ["oracleCard", "name"],
    ["name"],
    ["displayName"],
    ["card", "oracleCard", "name"],
  ]);
  if (!name) return null;
  const quantity = safeNumber(getPathValue(entry, ["quantity"])) ?? safeNumber(getPathValue(cardRoot, ["qty"])) ?? 1;
  const section = normalizeSourceSection(
    getPathValue(entry, ["categories"]) ?? getPathValue(cardRoot, ["categories"]) ?? getPathValue(cardRoot, ["defaultCategory"]),
  );
  return {
    id: `archidekt-${index}`,
    name,
    quantity: Math.max(1, Math.trunc(quantity)),
    section,
    setCode: normalizeSetCode(
      firstString(edition, [["editioncode"], ["editionCode"], ["setCode"], ["code"], ["set"]]) ??
        firstString(cardRoot, [["setCode"], ["set_code"], ["set"]]),
    ),
    collectorNumber: normalizeCollectorNumber(
      firstString(edition, [["collectorNumber"], ["collector_number"], ["collector"]]) ??
        firstString(cardRoot, [["collectorNumber"], ["collector_number"]]),
    ),
    finish: inferFinish(JSON.stringify(getPathValue(entry, ["modifier"]) ?? "")),
    scryfallId:
      firstString(edition, [["scryfall_id"], ["scryfallId"], ["uid"]]) ??
      firstString(cardRoot, [["scryfall_id"], ["scryfallId"], ["uid"]]),
    oracleId: firstString(cardRoot, [["oracle_id"], ["oracleId"], ["oracleCardUid"], ["oracleCard", "oracle_id"]]),
  };
}

function archidektDeckRoot(json: unknown): unknown {
  return getPathValue(json, ["props", "pageProps", "redux", "deck"]) ?? getPathValue(json, ["deck"]) ?? json;
}

function parseArchidektNextData(html: string): unknown {
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error("Archidekt snapshot page did not expose deck data.");
  try {
    return JSON.parse(match[1]);
  } catch {
    throw new Error("Archidekt snapshot deck data was not valid JSON.");
  }
}

function cardsFromArchidektJson(json: unknown): ImportedDeck {
  const deckRoot = archidektDeckRoot(json);
  const cardsRoot = getPathValue(deckRoot, ["cards"]) ?? getPathValue(deckRoot, ["cardMap"]);
  const entries = Array.isArray(cardsRoot)
    ? cardsRoot
    : cardsRoot && typeof cardsRoot === "object"
      ? Object.values(cardsRoot as Record<string, unknown>)
      : [];
  const cards = entries
    .map((entry, index) => cardFromArchidektEntry(entry, index))
    .filter((entry): entry is DeckCardRequest => entry !== null);

  return {
    source: "archidekt",
    sourceLabel: "Archidekt",
    deckName: firstString(deckRoot, [["name"]]),
    cards: dedupeRequests(cards).slice(0, REQUEST_LIMIT),
    warnings: [],
  };
}

function extractPathId(url: URL, segment: string): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  const index = parts.findIndex((part) => part.toLowerCase() === segment);
  if (index >= 0 && parts[index + 1]) return parts[index + 1];
  return null;
}

function extractDeckId(url: URL): string | null {
  return extractPathId(url, "decks");
}

async function fetchMoxfieldDeck(url: URL): Promise<ImportedDeck> {
  const id = extractDeckId(url);
  if (!id) throw new Error("Could not find a Moxfield deck id in that link.");
  const endpoints = [
    `https://api2.moxfield.com/v3/decks/all/${encodeURIComponent(id)}`,
    `https://api.moxfield.com/v2/decks/all/${encodeURIComponent(id)}`,
  ];

  let lastError: unknown;
  for (const endpoint of endpoints) {
    try {
      const deck = cardsFromMoxfieldJson(await fetchJson(endpoint));
      if (deck.cards.length > 0) return deck;
      lastError = new Error("Moxfield returned no cards.");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not import that Moxfield deck.");
}

async function fetchArchidektDeck(url: URL): Promise<ImportedDeck> {
  const snapshotId = extractPathId(url, "snapshots");
  if (snapshotId) {
    const deck = cardsFromArchidektJson(
      parseArchidektNextData(await fetchText(`https://archidekt.com/snapshots/${encodeURIComponent(snapshotId)}`)),
    );
    if (deck.cards.length === 0) throw new Error("Archidekt snapshot returned no cards.");
    return deck;
  }

  const id = extractDeckId(url);
  if (!id) throw new Error("Could not find an Archidekt deck id in that link.");
  const deck = cardsFromArchidektJson(
    await fetchJson(`https://archidekt.com/api/decks/${encodeURIComponent(id)}/`),
  );
  if (deck.cards.length === 0) throw new Error("Archidekt returned no cards.");
  return deck;
}

async function fetchManaBoxDeck(url: URL): Promise<ImportedDeck> {
  const response = await fetch(url.toString(), { headers: externalFetchHeaders() });
  if (!response.ok) {
    throw new Error(`ManaBox returned HTTP ${response.status}. Try pasting the exported decklist instead.`);
  }
  const text = await response.text();
  const stripped = text
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
  const cards = parseDeckText(stripped);
  if (cards.length === 0) {
    throw new Error("ManaBox link import is best-effort and this link did not expose a decklist. Paste or upload the ManaBox export text instead.");
  }
  return {
    source: "manabox",
    sourceLabel: "ManaBox",
    cards,
    warnings: ["ManaBox links are best-effort; review imported card names before adding to satchel."],
  };
}

export async function importDeckInput(input: string): Promise<ImportedDeck> {
  const trimmed = input.trim();
  const url = parseKnownUrl(trimmed);
  if (!url) {
    return {
      source: "text",
      sourceLabel: "Pasted decklist",
      cards: parseDeckText(trimmed),
      warnings: [],
    };
  }

  const source = detectDeckSource(trimmed);
  if (source === "moxfield") return fetchMoxfieldDeck(url);
  if (source === "archidekt") return fetchArchidektDeck(url);
  if (source === "manabox") return fetchManaBoxDeck(url);
  return {
    source: "text",
    sourceLabel: "Pasted decklist",
    cards: parseDeckText(trimmed),
    warnings: [],
  };
}

function isExactMatch(request: DeckCardRequest, card: PublicCard): boolean {
  if (
    request.scryfallId &&
    card.scryfallId &&
    request.scryfallId.toLowerCase() === card.scryfallId.toLowerCase()
  ) {
    return !request.finish || request.finish === card.finish;
  }
  if (request.setCode && request.collectorNumber) {
    return (
      normalizeCardName(request.name) === normalizeCardName(card.name) &&
      normalizeSetCode(request.setCode) === normalizeSetCode(card.setCode) &&
      normalizeCollectorNumber(request.collectorNumber) === normalizeCollectorNumber(card.collectorNumber) &&
      (!request.finish || request.finish === card.finish)
    );
  }
  return false;
}

function sortOptions(a: DeckCheckOption, b: DeckCheckOption): number {
  const matchRank = { exact: 0, available: 1, alternate: 2 } as const;
  const aPrice = a.card.price ?? Number.POSITIVE_INFINITY;
  const bPrice = b.card.price ?? Number.POSITIVE_INFINITY;
  return (
    matchRank[a.matchType] - matchRank[b.matchType] ||
    FINISH_RANK[a.card.finish] - FINISH_RANK[b.card.finish] ||
    aPrice - bPrice ||
    (CONDITION_RANK[a.card.condition] ?? 99) - (CONDITION_RANK[b.card.condition] ?? 99) ||
    b.card.quantity - a.card.quantity ||
    a.card.name.localeCompare(b.card.name) ||
    a.card.id.localeCompare(b.card.id)
  );
}

function requestedPrintingLabel(request: DeckCardRequest): string | null {
  const pieces: string[] = [];
  if (request.setCode) pieces.push(request.setCode.toUpperCase());
  if (request.collectorNumber) pieces.push(`#${request.collectorNumber}`);
  const finish = formatFinish(request.finish);
  if (finish) pieces.push(finish);
  return pieces.length > 0 ? pieces.join(" · ") : null;
}

function optionReason(type: DeckOptionMatchType, request: DeckCardRequest, card: PublicCard): string {
  if (type === "exact") return "Exact requested printing";
  if (type === "available") return "Spellbook has this card";
  const requested = requestedPrintingLabel(request);
  const available = `${card.setCode.toUpperCase()} #${card.collectorNumber}`;
  return requested ? `Different printing: ${available}` : `Alternate Spellbook printing: ${available}`;
}

export function matchDeckToInventory(
  requests: DeckCardRequest[],
  inventory: PublicCard[],
  identities: Map<string, DeckCheckInventoryIdentity> = new Map(),
  matchOptions: { printingRequestedIds?: Set<string> } = {},
): DeckCheckResult {
  const inventoryWithStock = inventory.filter((card) => card.quantity > 0);
  const byName = new Map<string, PublicCard[]>();
  const byOracle = new Map<string, PublicCard[]>();

  for (const card of inventoryWithStock) {
    const nameKey = normalizeCardName(card.name);
    byName.set(nameKey, [...(byName.get(nameKey) ?? []), card]);
    const oracleId = identities.get(card.id)?.oracleId;
    if (oracleId) byOracle.set(oracleId, [...(byOracle.get(oracleId) ?? []), card]);
  }

  const items: DeckCheckItem[] = requests.map((request) => {
    const exactCards = inventoryWithStock.filter((card) => isExactMatch(request, card));
    const oracleCards = request.oracleId ? (byOracle.get(request.oracleId) ?? []) : [];
    const nameCards = byName.get(normalizeCardName(request.name)) ?? [];
    const hasRequestedPrinting = matchOptions.printingRequestedIds
      ? matchOptions.printingRequestedIds.has(request.id)
      : Boolean(request.setCode || request.collectorNumber || request.scryfallId || request.oracleId);

    const candidates = new Map<string, DeckCheckOption>();
    const addCandidates = (cards: PublicCard[], matchType: DeckOptionMatchType) => {
      for (const card of cards) {
        const existing = candidates.get(card.id);
        if (existing && existing.matchType === "exact") continue;
        candidates.set(card.id, {
          card,
          matchType,
          reason: optionReason(matchType, request, card),
          recommended: false,
          addQuantity: Math.min(request.quantity, card.quantity),
        });
      }
    };

    addCandidates(exactCards, "exact");
    addCandidates(
      [...oracleCards, ...nameCards].filter((card) => !exactCards.some((exact) => exact.id === card.id)),
      hasRequestedPrinting ? "alternate" : "available",
    );

    const options = [...candidates.values()].sort(sortOptions);
    if (options[0]) options[0].recommended = true;

    const status: DeckMatchStatus =
      options.length === 0
        ? "missing"
        : options.some((option) => option.matchType === "exact")
          ? "exact"
          : options.some((option) => option.matchType === "alternate")
            ? "alternate"
            : "available";

    const statusLabel =
      status === "exact"
        ? "Exact match"
        : status === "alternate"
          ? "Alternate printing"
          : status === "available"
            ? "Spellbook match"
            : "Not in Spellbook";

    return {
      request,
      status,
      statusLabel,
      requestedPrintingLabel: requestedPrintingLabel(request),
      options,
      recommendedCardId: options[0]?.card.id ?? null,
    };
  });

  const exactCards = items.filter((item) => item.status === "exact").length;
  const alternateCards = items.filter((item) => item.status === "alternate").length;
  const availableNameCards = items.filter((item) => item.status === "available").length;
  const missingCards = items.filter((item) => item.status === "missing").length;
  const addableQuantity = items.reduce((sum, item) => sum + (item.options[0]?.addQuantity ?? 0), 0);
  const totalPrices = items.map((item) => {
    const option = item.options[0];
    if (!option || option.card.price == null) return null;
    return option.card.price * option.addQuantity;
  });
  const pricedTotal = totalPrices.every((value) => value !== null)
    ? totalPrices.reduce((sum, value) => sum + (value ?? 0), 0)
    : null;

  return {
    source: "text",
    sourceLabel: "Pasted decklist",
    warnings: [],
    summary: {
      requestedCards: requests.length,
      requestedQuantity: requests.reduce((sum, request) => sum + request.quantity, 0),
      matchedCards: items.length - missingCards,
      exactCards,
      alternateCards,
      availableNameCards,
      missingCards,
      addableQuantity,
      estimatedTotal: pricedTotal,
    },
    items,
  };
}

export async function resolveDeckCheckIdentities(
  requests: DeckCardRequest[],
  inventory: PublicCard[],
): Promise<Map<string, DeckCheckInventoryIdentity>> {
  const identities = new Map<string, DeckCheckInventoryIdentity>();
  const inventoryIds = inventory
    .map((card) => card.scryfallId)
    .filter((id): id is string => Boolean(id));
  const requestIds = requests
    .map((request) => request.scryfallId)
    .filter((id): id is string => Boolean(id));

  const cardsById = await fetchCardsByScryfallIds([...inventoryIds, ...requestIds]);

  for (const card of inventory) {
    const resolved = card.scryfallId ? cardsById.get(card.scryfallId) : undefined;
    identities.set(card.id, {
      scryfallId: card.scryfallId,
      oracleId: resolved?.oracle_id ?? null,
    });
  }

  const unresolvedNames = requests
    .filter((request) => !request.oracleId && !request.scryfallId)
    .map((request) => request.name);
  const cardsByName = await fetchCardsByNames(unresolvedNames);

  for (const request of requests) {
    const byId = request.scryfallId ? cardsById.get(request.scryfallId) : undefined;
    const byName = cardsByName.get(request.name.trim().replace(/\s+/g, " ").toLowerCase());
    request.oracleId = request.oracleId ?? byId?.oracle_id ?? byName?.oracle_id;
  }

  return identities;
}

export async function buildDeckCheckResult(
  input: string,
  inventory: PublicCard[],
  options: { resolveIdentities?: boolean } = {},
): Promise<DeckCheckResult> {
  const imported = await importDeckInput(input);
  const warnings = [...imported.warnings];
  const printingRequestedIds = new Set(
    imported.cards
      .filter((card) => Boolean(card.setCode || card.collectorNumber || card.scryfallId || card.oracleId))
      .map((card) => card.id),
  );

  if (imported.cards.length === 0) {
    return {
      source: imported.source,
      sourceLabel: imported.sourceLabel,
      deckName: imported.deckName,
      warnings: [
        ...warnings,
        "No cards were found. Paste an exported list like `1 Sol Ring` on each line.",
      ],
      summary: {
        requestedCards: 0,
        requestedQuantity: 0,
        matchedCards: 0,
        exactCards: 0,
        alternateCards: 0,
        availableNameCards: 0,
        missingCards: 0,
        addableQuantity: 0,
        estimatedTotal: 0,
      },
      items: [],
    };
  }

  let identities = new Map<string, DeckCheckInventoryIdentity>();
  if (options.resolveIdentities !== false) {
    try {
      identities = await resolveDeckCheckIdentities(imported.cards, inventory);
    } catch (error) {
      console.warn("Deck check Scryfall identity resolution failed:", error);
      warnings.push("Scryfall identity lookup was unavailable, so matching fell back to card names and set numbers.");
    }
  }

  const result = matchDeckToInventory(imported.cards, inventory, identities, {
    printingRequestedIds,
  });
  return {
    ...result,
    source: imported.source,
    sourceLabel: imported.sourceLabel,
    deckName: imported.deckName,
    warnings,
  };
}
