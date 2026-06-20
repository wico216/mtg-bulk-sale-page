import "server-only";

import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adminAuditLog, commanderLinks } from "@/db/schema";
import type { CommanderLink } from "@/lib/commander-links-types";

const MAX_COMMANDER_NAME_LENGTH = 100;
const MAX_URL_LENGTH = 500;
const SCRYFALL_HEADERS = {
  Accept: "application/json",
  "User-Agent": "WikoSpellbinder/1.0 (+https://wikospellbinder.com)",
} as const;

type CommanderLinkRow = typeof commanderLinks.$inferSelect;

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

export function normalizeCommanderName(value: unknown): string {
  if (typeof value !== "string") throw new Error("name must be a string");
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("name is required");
  if (name.length > MAX_COMMANDER_NAME_LENGTH) {
    throw new Error(`name must be ${MAX_COMMANDER_NAME_LENGTH} characters or less`);
  }
  return name;
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

export async function resolveCommanderImageUrlByName(name: string): Promise<string | null> {
  const url = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`;
  try {
    const response = await fetch(url, { headers: SCRYFALL_HEADERS });
    if (!response.ok) return null;
    const card = (await response.json()) as {
      image_uris?: { normal?: string; large?: string };
      card_faces?: Array<{ image_uris?: { normal?: string; large?: string } }>;
    };
    return (
      card.image_uris?.normal ??
      card.image_uris?.large ??
      card.card_faces?.[0]?.image_uris?.normal ??
      card.card_faces?.[0]?.image_uris?.large ??
      null
    );
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
