import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/auth/helpers";

export const QA_GATE_COOKIE_NAME = "wiko_qa_gate";
export const QA_GATE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type QaGateAccess =
  | { ok: true; actorEmail: string | null; via: "admin" | "qa-cookie" }
  | { ok: false; reason: "missing" | "expired" | "invalid" | "not-configured" };

type QaGateTokenPayload = {
  sub: "qa-gate";
  iat: number;
  exp: number;
};

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function qaGateCookieSecret(): string | null {
  return process.env.QA_GATE_COOKIE_SECRET || process.env.AUTH_SECRET || null;
}

export function isQaGateConfigured(): boolean {
  return Boolean(process.env.QA_GATE_PASSWORD && qaGateCookieSecret());
}

function signPayload(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function createQaGateToken(now = new Date()): string {
  const secret = qaGateCookieSecret();
  if (!secret) {
    throw new Error("QA gate cookie secret is not configured");
  }

  const issuedAt = Math.floor(now.getTime() / 1000);
  const payload: QaGateTokenPayload = {
    sub: "qa-gate",
    iat: issuedAt,
    exp: issuedAt + QA_GATE_COOKIE_MAX_AGE_SECONDS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${signPayload(encodedPayload, secret)}`;
}

export function verifyQaGateToken(
  token: string | undefined,
  now = new Date(),
): QaGateAccess {
  const secret = qaGateCookieSecret();
  if (!secret) return { ok: false, reason: "not-configured" };
  if (!token) return { ok: false, reason: "missing" };

  const [encodedPayload, signature, ...rest] = token.split(".");
  if (!encodedPayload || !signature || rest.length > 0) {
    return { ok: false, reason: "invalid" };
  }

  const expectedSignature = signPayload(encodedPayload, secret);
  const expected = Buffer.from(expectedSignature, "base64url");
  const actual = Buffer.from(signature, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: "invalid" };
  }

  const decoded = base64UrlDecode(encodedPayload);
  if (!decoded) return { ok: false, reason: "invalid" };

  let payload: QaGateTokenPayload;
  try {
    payload = JSON.parse(decoded) as QaGateTokenPayload;
  } catch {
    return { ok: false, reason: "invalid" };
  }

  if (payload.sub !== "qa-gate" || typeof payload.exp !== "number") {
    return { ok: false, reason: "invalid" };
  }

  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (payload.exp < nowSeconds) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, actorEmail: null, via: "qa-cookie" };
}

function timingSafeStringEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function verifyQaGatePassword(password: string): boolean {
  const configuredPassword = process.env.QA_GATE_PASSWORD;
  if (!configuredPassword) return false;
  return timingSafeStringEquals(password, configuredPassword);
}

export async function getQaGateAccess(): Promise<QaGateAccess> {
  const session = await auth();
  if (isAdminEmail(session?.user?.email)) {
    return { ok: true, actorEmail: session?.user?.email ?? null, via: "admin" };
  }

  const cookieStore = await cookies();
  return verifyQaGateToken(cookieStore.get(QA_GATE_COOKIE_NAME)?.value);
}

export function safeQaNextPath(value: string | null): string {
  if (!value) return "/qa/gates";
  if (!value.startsWith("/qa")) return "/qa/gates";
  if (value.startsWith("//")) return "/qa/gates";
  return value;
}
