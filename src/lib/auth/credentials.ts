import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import type { User } from "next-auth";

function hash(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Constant-time comparison over fixed-length SHA-256 digests. */
export function constantTimeEqualString(actual: string, expected: string): boolean {
  return timingSafeEqual(hash(actual), hash(expected));
}

/**
 * Auth.js Credentials authorize helper for the single-admin store.
 *
 * User input is intentionally checked generically: callers get null for any
 * mismatch so the login page never reveals whether username or password failed.
 */
export async function authorizeAdminCredentials(
  credentials: Partial<Record<"username" | "password", unknown>>,
): Promise<User | null> {
  const expectedUsername = process.env.ADMIN_USERNAME;
  const expectedPassword = process.env.ADMIN_PASSWORD;
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!expectedUsername || !expectedPassword || !adminEmail) return null;
  if (typeof credentials.username !== "string") return null;
  if (typeof credentials.password !== "string") return null;

  const usernameMatches = constantTimeEqualString(
    credentials.username,
    expectedUsername,
  );
  const passwordMatches = constantTimeEqualString(
    credentials.password,
    expectedPassword,
  );

  if (!usernameMatches || !passwordMatches) return null;

  return {
    id: "admin",
    name: expectedUsername,
    email: adminEmail,
  };
}
