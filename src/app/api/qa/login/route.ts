import { NextResponse } from "next/server";
import {
  createQaGateToken,
  isQaGateConfigured,
  QA_GATE_COOKIE_MAX_AGE_SECONDS,
  QA_GATE_COOKIE_NAME,
  safeQaNextPath,
  verifyQaGatePassword,
} from "@/lib/qa-gate-auth";
import { clientKeyFromRequest, enforceRateLimit, RATE_LIMIT_BUCKETS } from "@/lib/rate-limit";
import { logEvent } from "@/lib/logger";

const ROUTE = "/api/qa/login";

export async function POST(request: Request) {
  const formData = await request.formData();
  const password = formData.get("password");
  const next = safeQaNextPath(
    typeof formData.get("next") === "string" ? (formData.get("next") as string) : null,
  );
  const redirectUrl = new URL(next, request.url);

  if (!isQaGateConfigured()) {
    redirectUrl.pathname = "/qa/login";
    redirectUrl.search = `?error=not-configured&next=${encodeURIComponent(next)}`;
    return NextResponse.redirect(redirectUrl, { status: 303 });
  }

  const rateLimited = await enforceRateLimit({
    key: clientKeyFromRequest(request, "qa-login"),
    config: RATE_LIMIT_BUCKETS.ADMIN_MUTATION,
  });
  if (rateLimited) return rateLimited;

  if (typeof password !== "string" || !verifyQaGatePassword(password)) {
    const failedUrl = new URL("/qa/login", request.url);
    failedUrl.search = `?error=bad-password&next=${encodeURIComponent(next)}`;
    logEvent({ level: "warn", event: "qa_gate.login_failed", route: ROUTE });
    return NextResponse.redirect(failedUrl, { status: 303 });
  }

  const response = NextResponse.redirect(redirectUrl, { status: 303 });
  response.cookies.set(QA_GATE_COOKIE_NAME, createQaGateToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: QA_GATE_COOKIE_MAX_AGE_SECONDS,
  });

  logEvent({ level: "info", event: "qa_gate.login_succeeded", route: ROUTE });
  return response;
}
