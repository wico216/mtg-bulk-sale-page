import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { adminAuditLog, binderShareLinks } from "@/db/schema";
import { normalizeBinderName } from "@/lib/binder-name";
import { isPrivateWBinder } from "@/lib/binder-scope";
import type { WBinderShareLink } from "@/lib/w-binder-share-types";

const W_BINDER_SHARE_SCOPE = "w_binders";
const TOKEN_BYTES = 32;
const MAX_LABEL_LENGTH = 80;
const MAX_ALLOWED_BINDERS = 100;

export interface CreatedWBinderShareLink {
  link: WBinderShareLink;
  token: string;
}

type BinderShareLinkRow = typeof binderShareLinks.$inferSelect;

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function rowToWBinderShareLink(row: BinderShareLinkRow): WBinderShareLink {
  return {
    id: row.id,
    label: row.label,
    scope: W_BINDER_SHARE_SCOPE,
    allowedBinders: row.allowedBinders?.length ? row.allowedBinders : null,
    createdByEmail: row.createdByEmail,
    expiresAt: toIso(row.expiresAt),
    revokedAt: toIso(row.revokedAt),
    lastUsedAt: toIso(row.lastUsedAt),
    useCount: row.useCount,
    createdAt: row.createdAt.toISOString(),
  };
}

export function generateWBinderShareToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashWBinderShareToken(token: string): string {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
}

export function normalizeShareLabel(value: unknown): string {
  if (typeof value !== "string") throw new Error("label must be a string");
  const label = value.trim().replace(/\s+/g, " ");
  if (!label) throw new Error("label is required");
  if (label.length > MAX_LABEL_LENGTH) {
    throw new Error(`label must be ${MAX_LABEL_LENGTH} characters or less`);
  }
  return label;
}

export function normalizeAllowedWBinders(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) throw new Error("allowedBinders must be an array");
  if (value.length === 0) return null;
  if (value.length > MAX_ALLOWED_BINDERS) {
    throw new Error(`allowedBinders cannot contain more than ${MAX_ALLOWED_BINDERS} entries`);
  }

  const normalized = [...new Set(
    value.map((binder) => {
      if (typeof binder !== "string") throw new Error("allowedBinders must contain strings only");
      const normalizedBinder = normalizeBinderName(binder);
      if (!isPrivateWBinder(normalizedBinder)) {
        throw new Error("allowedBinders may only include private W binders");
      }
      return normalizedBinder;
    }),
  )].sort();

  return normalized.length > 0 ? normalized : null;
}

export function parseShareExpiresAt(value: unknown, now = new Date()): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error("expiresAt must be an ISO timestamp or null");
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("expiresAt must be a valid ISO timestamp");
  if (parsed.getTime() <= now.getTime()) throw new Error("expiresAt must be in the future");
  return parsed;
}

async function insertAuditEntry(args: {
  action: "w_binder_share.create" | "w_binder_share.revoke" | "w_binder_share.resolve";
  actorEmail: string | null;
  targetId: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(adminAuditLog).values({
    action: args.action,
    actorEmail: args.actorEmail,
    targetType: "binder_share_link",
    targetId: args.targetId,
    metadata: args.metadata ?? {},
  });
}

export async function listWBinderShareLinks(): Promise<WBinderShareLink[]> {
  const rows = await db
    .select()
    .from(binderShareLinks)
    .where(eq(binderShareLinks.scope, W_BINDER_SHARE_SCOPE))
    .orderBy(desc(binderShareLinks.createdAt), desc(binderShareLinks.id));
  return rows.map(rowToWBinderShareLink);
}

export async function createWBinderShareLink(args: {
  label: string;
  allowedBinders?: string[] | null;
  expiresAt?: Date | null;
  actorEmail: string | null;
  token?: string;
}): Promise<CreatedWBinderShareLink> {
  const token = args.token ?? generateWBinderShareToken();
  const tokenHash = hashWBinderShareToken(token);
  const allowedBinders = args.allowedBinders?.length ? args.allowedBinders : null;

  const [row] = await db
    .insert(binderShareLinks)
    .values({
      tokenHash,
      label: args.label,
      scope: W_BINDER_SHARE_SCOPE,
      allowedBinders,
      expiresAt: args.expiresAt ?? null,
      createdByEmail: args.actorEmail,
    })
    .returning();

  await insertAuditEntry({
    action: "w_binder_share.create",
    actorEmail: args.actorEmail,
    targetId: String(row.id),
    metadata: {
      label: row.label,
      allowedBinders: allowedBinders ?? "all_w_binders",
      expiresAt: row.expiresAt?.toISOString() ?? null,
    },
  });

  return { link: rowToWBinderShareLink(row), token };
}

export async function revokeWBinderShareLink(args: {
  id: number;
  actorEmail: string | null;
  now?: Date;
}): Promise<WBinderShareLink | null> {
  const [existing] = await db
    .select()
    .from(binderShareLinks)
    .where(and(eq(binderShareLinks.id, args.id), eq(binderShareLinks.scope, W_BINDER_SHARE_SCOPE)))
    .limit(1);

  if (!existing) return null;
  if (existing.revokedAt) return rowToWBinderShareLink(existing);

  const revokedAt = args.now ?? new Date();
  const [row] = await db
    .update(binderShareLinks)
    .set({ revokedAt })
    .where(eq(binderShareLinks.id, args.id))
    .returning();

  await insertAuditEntry({
    action: "w_binder_share.revoke",
    actorEmail: args.actorEmail,
    targetId: String(row.id),
    metadata: { label: row.label },
  });

  return rowToWBinderShareLink(row);
}

export function isWBinderShareLinkActive(
  link: WBinderShareLink,
  now = new Date(),
): boolean {
  if (link.revokedAt) return false;
  if (link.expiresAt && Date.parse(link.expiresAt) <= now.getTime()) return false;
  return true;
}

export async function resolveWBinderShareLink(
  token: string,
  now = new Date(),
): Promise<WBinderShareLink | null> {
  const tokenHash = hashWBinderShareToken(token);
  const [row] = await db
    .select()
    .from(binderShareLinks)
    .where(and(eq(binderShareLinks.tokenHash, tokenHash), eq(binderShareLinks.scope, W_BINDER_SHARE_SCOPE)))
    .limit(1);

  if (!row) return null;
  const link = rowToWBinderShareLink(row);
  if (!isWBinderShareLinkActive(link, now)) return null;

  const [updated] = await db
    .update(binderShareLinks)
    .set({
      lastUsedAt: now,
      useCount: sql`${binderShareLinks.useCount} + 1`,
    })
    .where(eq(binderShareLinks.id, row.id))
    .returning();

  return rowToWBinderShareLink(updated);
}
