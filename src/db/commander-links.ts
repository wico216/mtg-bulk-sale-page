import "server-only";

import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adminAuditLog, commanderLinks } from "@/db/schema";
import type { CommanderLink, CommanderSearchResult } from "@/lib/commander-links-types";

const MAX_COMMANDER_NAME_LENGTH = 100;
const MAX_COMMANDER_SEARCH_LENGTH = 80;
const MAX_URL_LENGTH = 500;
const MAX_SEARCH_RESULTS = 8;
const SCRYFALL_HEADERS = {
  Accept: "application/json",
  "User-Agent": "WikoSpellbinder/1.0 (+https://wikospellbinder.com)",
} as const;

type CommanderLinkRow = typeof commanderLinks.$inferSelect;

type ScryfallCommanderCard = {
  id?: string;
  name?: string;
  type_line?: string;
  color_identity?: string[];
  image_uris?: { small?: string; normal?: string; large?: string };
  card_faces?: Array<{
    image_uris?: { small?: string; normal?: string; large?: string };
  }>;
};

function toIso(value: Date): string {
  return value.toISOString();
}

function rowToCommanderLink(row: CommanderLinkRow): CommanderLink {
  return {
    id: row.id,
    name: row.name,
    edhrecUrl: row.edhrecUrl,
    imageUrl: row.imageUrl,
    createdByEmail: row.createdByEmail,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function normalizeHttpUrl(value: string, field: string): string {
  if (value.length > MAX_URL_LENGTH) {
    throw new Error(`${field} must be ${MAX_URL_LENGTH} characters or less`);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${field} must be a valid URL`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`${field} must use http or https`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${field} must not include credentials`);
  }

  return parsed.toString();
}

function scryfallImageUrl(card: ScryfallCommanderCard): string | null {
  return (
    card.image_uris?.normal ??
    card.image_uris?.large ??
    card.image_uris?.small ??
    card.card_faces?.[0]?.image_uris?.normal ??
    card.card_faces?.[0]?.image_uris?.large ??
    card.card_faces?.[0]?.image_uris?.small ??
    null
  );
}

function commanderSearchResult(card: ScryfallCommanderCard): CommanderSearchResult | null {
  if (typeof card.name !== "string" || !card.name.trim()) return null;
  const name = normalizeCommanderName(card.name);
  return {
    name,
    scryfallId: typeof card.id === "string" ? card.id : null,
    edhrecUrl: buildEdhrecCommanderUrl(name),
    imageUrl: scryfallImageUrl(card),
    typeLine: typeof card.type_line === "string" ? card.type_line : null,
    colorIdentity: Array.isArray(card.color_identity) ? card.color_identity : [],
  };
}

export function normalizeCommanderName(value: unknown): string {
  if (typeof value !== "string") throw new Error("name must be a string");
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("name is required");
  if (name.length > MAX_COMMANDER_NAME_LENGTH) {
    throw new Error(`name must be ${MAX_COMMANDER_NAME_LENGTH} characters or less`);
  }
  return name;
}

export function normalizeCommanderSearchQuery(value: unknown): string {
  if (typeof value !== "string") throw new Error("query must be a string");
  const query = value.trim().replace(/\s+/g, " ");
  if (query.length < 2) throw new Error("query must be at least 2 characters");
  if (query.length > MAX_COMMANDER_SEARCH_LENGTH) {
    throw new Error(`query must be ${MAX_COMMANDER_SEARCH_LENGTH} characters or less`);
  }
  return query;
}

export function buildEdhrecCommanderUrl(value: string): string {
  const name = normalizeCommanderName(value).split(" // ")[0];
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) throw new Error("name must contain at least one alphanumeric character");
  return `https://edhrec.com/commanders/${slug}`;
}

export function normalizeEdhrecUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error("edhrecUrl must be a string");
  const trimmed = value.trim();
  if (!trimmed) throw new Error("edhrecUrl is required");
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    throw new Error("edhrecUrl must use http or https");
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const normalized = normalizeHttpUrl(withProtocol, "edhrecUrl");
  const parsed = new URL(normalized);
  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== "edhrec.com" && hostname !== "www.edhrec.com") {
    throw new Error("edhrecUrl must be an EDHREC link");
  }
  parsed.protocol = "https:";
  return parsed.toString();
}

export function normalizeCommanderImageUrl(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error("imageUrl must be a string");
  const trimmed = value.trim();
  if (!trimmed) return null;
  return normalizeHttpUrl(trimmed, "imageUrl");
}

async function insertAuditEntry(args: {
  action: "commander_link.create" | "commander_link.delete";
  actorEmail: string | null;
  targetId: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(adminAuditLog).values({
    action: args.action,
    actorEmail: args.actorEmail,
    targetType: "commander_link",
    targetId: args.targetId,
    metadata: args.metadata ?? {},
  });
}

export async function searchCommanderCards(query: string): Promise<CommanderSearchResult[]> {
  const normalizedQuery = normalizeCommanderSearchQuery(query);
  const url = new URL("https://api.scryfall.com/cards/search");
  url.searchParams.set("unique", "cards");
  url.searchParams.set("order", "name");
  url.searchParams.set("q", `is:commander ${normalizedQuery}`);

  try {
    const response = await fetch(url.toString(), { headers: SCRYFALL_HEADERS });
    if (response.status === 404) return [];
    if (!response.ok) return [];

    const body = (await response.json()) as { data?: ScryfallCommanderCard[] };
    if (!Array.isArray(body.data)) return [];

    return body.data
      .slice(0, MAX_SEARCH_RESULTS)
      .map(commanderSearchResult)
      .filter((result): result is CommanderSearchResult => result !== null);
  } catch {
    return [];
  }
}

export async function resolveCommanderImageUrlByName(name: string): Promise<string | null> {
  const url = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`;
  try {
    const response = await fetch(url, { headers: SCRYFALL_HEADERS });
    if (!response.ok) return null;
    const card = (await response.json()) as ScryfallCommanderCard;
    return scryfallImageUrl(card);
  } catch {
    return null;
  }
}

export async function listCommanderLinks(): Promise<CommanderLink[]> {
  const rows = await db
    .select()
    .from(commanderLinks)
    .orderBy(asc(commanderLinks.name), asc(commanderLinks.id));
  return rows.map(rowToCommanderLink);
}

export async function createCommanderLink(args: {
  name: string;
  edhrecUrl: string;
  imageUrl?: string | null;
  actorEmail: string | null;
}): Promise<CommanderLink> {
  const imageUrl = args.imageUrl ?? (await resolveCommanderImageUrlByName(args.name));
  const now = new Date();
  const [row] = await db
    .insert(commanderLinks)
    .values({
      name: args.name,
      edhrecUrl: args.edhrecUrl,
      imageUrl,
      createdByEmail: args.actorEmail,
      updatedAt: now,
    })
    .returning();

  await insertAuditEntry({
    action: "commander_link.create",
    actorEmail: args.actorEmail,
    targetId: String(row.id),
    metadata: { name: row.name, edhrecUrl: row.edhrecUrl },
  });

  return rowToCommanderLink(row);
}

export async function deleteCommanderLink(args: {
  id: number;
  actorEmail: string | null;
}): Promise<CommanderLink | null> {
  const [row] = await db
    .delete(commanderLinks)
    .where(eq(commanderLinks.id, args.id))
    .returning();

  if (!row) return null;

  await insertAuditEntry({
    action: "commander_link.delete",
    actorEmail: args.actorEmail,
    targetId: String(row.id),
    metadata: { name: row.name, edhrecUrl: row.edhrecUrl },
  });

  return rowToCommanderLink(row);
}
